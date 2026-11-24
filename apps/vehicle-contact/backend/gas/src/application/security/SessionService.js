// Server-authoritative sessions and immutable role-to-permission policy.
export const ROLE_PERMISSIONS=Object.freeze({
 SYSTEM_ADMIN:['session.authenticated','system.settings.read','system.settings.manage','users.manage','organizations.read','organizations.manage','campaigns.manage','qr.manage','retention.read','retention.delete.approve','audit.read','vehicle.list'],
 REGISTRATION_ADMIN:['session.authenticated','organizations.read','vehicle.registration.approve','vehicle.lookup','vehicle.list','vehicle.contact.read','vehicle.photos.read','vehicle.update','vehicle.history.read','vehicle.change.approve','qr.manage','retention.read'],
 STAFF:['session.authenticated','organizations.read','vehicle.lookup','vehicle.contact.read','vehicle.photos.read','vehicle.history.read'],
 OWNER:['session.authenticated','vehicle.change.submit','vehicle.own.read'],
 RETENTION_WORKER:['session.authenticated','retention.worker']
});
function accessFrom(roleRows,overrideRows){
 const assignments=roleRows.filter(x=>x.status==='ACTIVE').map(x=>String(x.role_id));
 const overrides=overrideRows.filter(x=>x.status==='ACTIVE').map(x=>String(x.permission));
 return {roles:assignments,permissions:[...new Set([...assignments.flatMap(r=>ROLE_PERMISSIONS[r]||[]),...overrides])]};
}
// Speed, owner-approved 2026-11-24 ("อนุญาต" session cache): a 60 s snapshot of the verified
// session + user (WITHOUT password_hash) + roles/permissions in the script cache, keyed by the
// token digest. Every expiry/idle/password-change/permission check still runs on each call against
// the snapshot; every revocation path (logout, password change, suspend, reset, role change)
// removes the user's snapshots at once, so revocation stays immediate. last_seen is written at
// most once per minute (idle timeout is minutes, so the error is < 60 s).
const SESSION_CACHE_SECONDS=60,TOUCH_INTERVAL_MS=60000;
const cacheKey=digest=>'p6vc:sess:'+digest;
function stripSecrets(user){const out={...user};delete out.password_hash;delete out.password_salt;return out;}
export function createSessionService({store,security,cache=null}) {
 // TUNEUP L2: user + role + override reads are independent once the session is known, so
 // they run in one parallel round when the store supports it.
 const readMany=typeof store.readMany==='function'?store.readMany
  :reqs=>reqs.map(r=>r.kind==='one'?store.one(r.name,r.filter):store.list(r.name,r.filter));
 // TUNEUP L1: last_seen is a field-masked blind write (never a read-modify-write of the
 // whole session), so it cannot overwrite a concurrent REVOKED status.
 const touch=typeof store.patch==='function'
  ?(id,fields)=>store.patch('vc_sessions',{session_id:id},fields)
  :(id,fields)=>store.update('vc_sessions',{session_id:id},fields);
 function permissionsFor(userId) {
  return accessFrom(store.list('vc_user_roles',{user_id:userId}),store.list('vc_user_permissions',{user_id:userId}));
 }
 function load(digest){
  const session=store.one('vc_sessions',{token_digest:digest});
  if(!session||session.status!=='ACTIVE'||session.revoked_at)throw new Error('UNAUTHENTICATED');
  const [user,roleRows,overrideRows]=readMany([
   {kind:'one',name:'vc_users',filter:{user_id:session.user_id}},
   {kind:'list',name:'vc_user_roles',filter:{user_id:session.user_id}},
   {kind:'list',name:'vc_user_permissions',filter:{user_id:session.user_id}}
  ]);
  if(!user||user.status!=='ACTIVE')throw new Error('UNAUTHENTICATED');
  return {session,user,access:accessFrom(roleRows,overrideRows)};
 }
 const readCache=key=>{if(!cache)return null;try{return JSON.parse(cache.get(key)||'null');}catch(_){return null;}};
 const writeCache=(key,snap)=>{if(!cache)return;try{cache.put(key,JSON.stringify(snap),SESSION_CACHE_SECONDS);}catch(_){/* optional */}};
 // fresh: ops that need the stored password hash (change password / link Google) always read
 // the live rows and never receive a cached user.
 function authorize(token,permission,{allowPasswordChange=false,fresh=false}={}) {
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/i.test(token))throw new Error('UNAUTHENTICATED');
  const digest=security.sha256(token.toLowerCase()),key=cacheKey(digest);
  let snap=fresh?null:readCache(key),liveUser=null;
  if(!snap){
   const loaded=load(digest);liveUser=loaded.user;
   snap={session:loaded.session,user:stripSecrets(loaded.user),access:loaded.access};
   writeCache(key,snap);
  }
  const {session,user,access}=snap;
  const now=Date.parse(security.now()),issued=Date.parse(session.issued_at);
  if(!Number.isFinite(issued)||issued>now||now>=Date.parse(session.expires_at))
   throw new Error('SESSION_EXPIRED');
  const idle=Number(session.idle_timeout_minutes);
  if(!Number.isSafeInteger(idle)||idle<1||idle>480)throw new Error('INVALID_SESSION_POLICY');
  if(now-Date.parse(session.last_seen_at)>=idle*60000)throw new Error('SESSION_IDLE_EXPIRED');
  if((user.password_change_required===true||String(user.password_change_required)==='true')&&!allowPasswordChange)
   throw new Error('PASSWORD_CHANGE_REQUIRED');
  if(!access.permissions.includes(permission))throw new Error('FORBIDDEN');
  if(now-Date.parse(session.last_seen_at)>=TOUCH_INTERVAL_MS){
   const at=security.now();
   touch(session.session_id,{last_seen_at:at});
   session.last_seen_at=at;writeCache(key,snap);
  }
  return {userId:user.user_id,user:liveUser||user,roles:access.roles,permissions:access.permissions,
   sessionId:session.session_id,session,sessionDigest:digest};
 }
 function forget(digests){if(!cache)return;for(const d of digests){try{cache.remove(cacheKey(d));}catch(_){}}}
 // logout: revoke this session and drop its snapshot.
 function endSession(actor){
  store.sequence(()=>store.update('vc_sessions',{session_id:actor.sessionId},{status:'REVOKED',revoked_at:security.now()}));
  forget([actor.sessionDigest].filter(Boolean));
 }
 function issue(user) {
  const policy=store.one('vc_settings',{key:'idle_timeout_minutes'});
  const idle=Number(policy&&policy.value);
  if(!Number.isSafeInteger(idle)||idle<1||idle>480)throw new Error('IDLE_POLICY_NOT_CONFIGURED');
  const token=security.secretToken(),date=security.now(),expires=new Date(Date.parse(date)+480*60000).toISOString();
  store.sequence(()=>store.insert('vc_sessions',{
   session_id:security.secretToken(),user_id:user.user_id,token_digest:security.sha256(token),
   status:'ACTIVE',issued_at:date,expires_at:expires,last_seen_at:date,idle_timeout_minutes:idle,revoked_at:''
  }));
  return {sessionToken:token,expiresAt:expires,mustChangePassword:user.password_change_required===true||String(user.password_change_required)==='true'};
 }
 function revokeUser(userId){
  return store.sequence(()=>{
   const rows=store.list('vc_sessions',{user_id:userId});
   for(const item of rows)if(item.status==='ACTIVE')store.update('vc_sessions',{session_id:item.session_id},{status:'REVOKED',revoked_at:security.now()});
   forget(rows.map(r=>r.token_digest).filter(Boolean));
   return rows.length;
  });
 }
 return Object.freeze({authorize,issue,revokeUser,endSession,permissionsFor});
}
