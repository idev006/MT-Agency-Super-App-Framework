// Server-authoritative sessions and immutable role-to-permission policy.
export const ROLE_PERMISSIONS=Object.freeze({
 SYSTEM_ADMIN:['session.authenticated','system.settings.read','system.settings.manage','users.manage','organizations.read','organizations.manage','campaigns.manage','qr.manage','retention.read','retention.delete.approve','audit.read','vehicle.list'],
 REGISTRATION_ADMIN:['session.authenticated','organizations.read','vehicle.registration.approve','vehicle.lookup','vehicle.list','vehicle.contact.read','vehicle.photos.read','vehicle.update','vehicle.history.read','vehicle.change.approve','qr.manage','retention.read'],
 STAFF:['session.authenticated','organizations.read','vehicle.lookup','vehicle.contact.read','vehicle.photos.read','vehicle.history.read'],
 OWNER:['session.authenticated','vehicle.change.submit','vehicle.own.read'],
 RETENTION_WORKER:['session.authenticated','retention.worker']
});
export function createSessionService({store,security}) {
 function permissionsFor(userId) {
  const assignments=store.list('vc_user_roles',{user_id:userId})
   .filter(x=>x.status==='ACTIVE').map(x=>String(x.role_id));
  const overrides=store.list('vc_user_permissions',{user_id:userId})
   .filter(x=>x.status==='ACTIVE').map(x=>String(x.permission));
  return {roles:assignments,permissions:[...new Set([...assignments.flatMap(r=>ROLE_PERMISSIONS[r]||[]),...overrides])]};
 }
 function authorize(token,permission,{allowPasswordChange=false}={}) {
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/i.test(token))throw new Error('UNAUTHENTICATED');
  const session=store.one('vc_sessions',{token_digest:security.sha256(token.toLowerCase())});
  if(!session||session.status!=='ACTIVE'||session.revoked_at)throw new Error('UNAUTHENTICATED');
  const user=store.one('vc_users',{user_id:session.user_id});
  if(!user||user.status!=='ACTIVE')throw new Error('UNAUTHENTICATED');
  const now=Date.parse(security.now()),issued=Date.parse(session.issued_at);
  if(!Number.isFinite(issued)||issued>now||now>=Date.parse(session.expires_at))
   throw new Error('SESSION_EXPIRED');
  const idle=Number(session.idle_timeout_minutes);
  if(!Number.isSafeInteger(idle)||idle<1||idle>480)throw new Error('INVALID_SESSION_POLICY');
  if(now-Date.parse(session.last_seen_at)>=idle*60000)throw new Error('SESSION_IDLE_EXPIRED');
  if((user.password_change_required===true||String(user.password_change_required)==='true')&&!allowPasswordChange)
   throw new Error('PASSWORD_CHANGE_REQUIRED');
  const access=permissionsFor(user.user_id);
  if(!access.permissions.includes(permission))throw new Error('FORBIDDEN');
  store.update('vc_sessions',{session_id:session.session_id},{last_seen_at:security.now()});
  return {userId:user.user_id,user,roles:access.roles,permissions:access.permissions,sessionId:session.session_id,session};
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
   return rows.length;
  });
 }
 return Object.freeze({authorize,issue,revokeUser,permissionsFor});
}
