import {ROLE_PERMISSIONS} from '../security/SessionService.js';
import {paginate} from '../pagination/Pagination.js';
// Static dummy hash with the same PBKDF2 cost as GasSecurity.hashPassword (150000 rounds).
// Used for unknown/inactive users so login always performs equal work (no username-enumeration timing oracle).
const DUMMY_PASSWORD_HASH='pbkdf2-sha256$150000$'+'0'.repeat(32)+'$'+'0'.repeat(64);
export function createIdentityOperations({store,security,sessions}) {
 const required=(value,name,max=256)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error('INVALID_'+name);return value.trim();};
 const text=v=>required(v,'TEXT').replace(/[\r\n]/g,' ');
 const changed=(event,actor,target,summary=event)=>store.insert('vc_change_audit',{audit_id:security.secretToken(),actor_id:actor||'SYSTEM',entity_type:'account',entity_id:target,action:event,redacted_summary:summary,correlation_id:security.secretToken().slice(0,16),created_at:security.now()});
 function issueLogin(user){if(!user||user.status!=='ACTIVE')throw new Error('INVALID_CREDENTIALS');return sessions.issue(user);}
 function attempts(username) {
  const digest=security.sha256('username:'+username),since=Date.parse(security.now())-15*60000;
  const recent=store.listNewest('vc_security_events',{username_digest:digest})
   .filter(x=>Date.parse(x.created_at)>since&&x.status==='FAILED');
  if(recent.length>=6)throw new Error('LOGIN_RATE_LIMIT');
  return digest;
 }
 function recordAttempt(digest,status){
  store.sequence(()=>store.insert('vc_security_events',{event_id:security.secretToken(),username_digest:digest,status,created_at:security.now()}));
 }
 function login(p) {
  const username=required(p.username,'USERNAME',100).normalize('NFKC').toLowerCase();
  const digest=attempts(username);
  const user=store.one('vc_users',{username_normalized:username});
  // Never reveal whether the username exists (message AND timing): verify unconditionally.
  const active=!!user&&user.status==='ACTIVE';
  const verified=security.verifyPassword(p.password,active?user.password_hash:DUMMY_PASSWORD_HASH);
  if(!active||!verified) {
   recordAttempt(digest,'FAILED');throw new Error('INVALID_CREDENTIALS');
  }
  recordAttempt(digest,'SUCCESS');
  return issueLogin(user);
 }
 function googleLogin(p) {
  const claim=security.verifyGoogle(p.idToken);
  const identity=store.one('vc_user_identities',{provider:'GOOGLE',provider_sub:claim.sub});
  return issueLogin(identity?store.one('vc_users',{user_id:identity.user_id}):null);
 }
 function changePassword(p,actor){
  if(!security.verifyPassword(p.oldPassword,actor.user.password_hash))throw new Error('INVALID_CREDENTIALS');
  const hash=security.hashPassword(p.newPassword);
  store.sequence(()=>{store.update('vc_users',{user_id:actor.userId},{password_hash:hash,password_change_required:false,updated_at:security.now()});changed('PASSWORD_CHANGED',actor.userId,actor.userId)});
  sessions.revokeUser(actor.userId);
  return {changed:true,reauthenticate:true};
 }
 function logout(p,actor){
  store.sequence(()=>store.update('vc_sessions',{session_id:actor.sessionId},{status:'REVOKED',revoked_at:security.now()}));
  return {revoked:true};
 }
 function session(p,actor){return {
  userId:actor.userId,
  displayName:actor.user.display_name||'',
  organizationId:actor.user.org_id||null,
  roles:actor.roles,
  permissions:actor.permissions,
  expiresAt:actor.session.expires_at,
  mustChangePassword:actor.user.password_change_required===true||String(actor.user.password_change_required)==='true'
 };}
 function linkGoogle(p,actor){
  if(!security.verifyPassword(p.password,actor.user.password_hash))throw new Error('INVALID_CREDENTIALS');
  const claim=security.verifyGoogle(p.idToken);
  if(store.one('vc_user_identities',{provider:'GOOGLE',provider_sub:claim.sub}))throw new Error('IDENTITY_ALREADY_LINKED');
  store.withLock(()=>{store.insert('vc_user_identities',{identity_id:security.secretToken(),user_id:actor.userId,provider:'GOOGLE',provider_sub:claim.sub,linked_at:security.now()});changed('GOOGLE_LINKED',actor.userId,actor.userId)});
  return {linked:true};
 }
 function createUser(p,actor) {
  const username=required(p.username,'USERNAME',100).normalize('NFKC').toLowerCase();
  const hash=security.hashPassword(p.temporaryPassword),id=security.secretToken();
  store.withLock(()=>{
   if(store.one('vc_users',{username_normalized:username}))throw new Error('DUPLICATE_USERNAME');
   store.insert('vc_users',{user_id:id,username_normalized:username,display_name:text(p.displayName),
    password_hash:hash,password_salt:'',password_change_required:true,status:'ACTIVE',
    org_id:p.organizationId||'',created_at:security.now(),updated_at:security.now()});
   store.insert('vc_user_roles',{assignment_id:security.secretToken(),user_id:id,role_id:'STAFF',status:'ACTIVE'});
   changed('USER_CREATED',actor.userId,id);
  });
  return {userId:id};
 }
 function listUsers(p){
  const items=store.list('vc_users').map(u=>({
   userId:u.user_id,username:u.username_normalized,displayName:u.display_name,organizationId:u.org_id,status:u.status,
   roles:store.list('vc_user_roles',{user_id:u.user_id}).filter(r=>r.status==='ACTIVE').map(r=>String(r.role_id))
  }));
  return paginate(items,p,{defaultLimit:50,maxLegacyLimit:100});
 }
 function updateUser(p,actor){
  const id=required(p.userId,'USER_ID');
  const patch={updated_at:security.now()};
  if(p.displayName!==undefined)patch.display_name=text(p.displayName);
  if(p.organizationId!==undefined)patch.org_id=required(p.organizationId,'ORGANIZATION_ID');
  store.sequence(()=>{store.update('vc_users',{user_id:id},patch);changed('USER_UPDATED',actor.userId,id)});
  return {userId:id,updated:true};
 }
 function suspend(p,actor){
  const id=required(p.userId,'USER_ID');
  if(id===actor.userId)throw new Error('SELF_SUSPEND_DENIED');
  store.sequence(()=>{store.update('vc_users',{user_id:id},{status:'SUSPENDED',updated_at:security.now()});changed('USER_SUSPENDED',actor.userId,id)});
  sessions.revokeUser(id);return {userId:id,suspended:true};
 }
 function resetPassword(p,actor){
  const id=required(p.userId,'USER_ID'),hash=security.hashPassword(p.temporaryPassword);
  store.sequence(()=>{store.update('vc_users',{user_id:id},{password_hash:hash,password_change_required:true,updated_at:security.now()});changed('PASSWORD_RESET',actor.userId,id)});
  sessions.revokeUser(id);return {userId:id,reset:true};
 }
 function assignRoles(p,actor) {
  const id=required(p.userId,'USER_ID');
  if(!store.one('vc_users',{user_id:id}))throw new Error('NOT_FOUND');
  if(!Array.isArray(p.roles)||!p.roles.length||p.roles.some(r=>!Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS,r)))
   throw new Error('INVALID_ROLES');
  const roles=[...new Set(p.roles)],current=store.list('vc_user_roles',{user_id:id})
   .filter(r=>r.status==='ACTIVE').map(r=>String(r.role_id));
  if(roles.includes('RETENTION_WORKER')&&roles.length>1)throw new Error('INVALID_ROLES');
  if(id===actor.userId&&!roles.includes('SYSTEM_ADMIN'))throw new Error('SELF_DEMOTION_DENIED');
  if(id===actor.userId&&roles.some(role=>!current.includes(role)))throw new Error('SELF_ROLE_EXPANSION_DENIED');
  store.withLock(()=>{
   for(const row of store.list('vc_user_roles',{user_id:id}))store.remove('vc_user_roles',{assignment_id:row.assignment_id});
   for(const r of roles)store.insert('vc_user_roles',{assignment_id:security.secretToken(),user_id:id,role_id:r,status:'ACTIVE'});
   changed('ROLES_CHANGED',actor.userId,id,'roles:'+current.slice().sort().join(',')+'->'+roles.slice().sort().join(','));
  });
  sessions.revokeUser(id);return {userId:id,roles};
 }
 return Object.freeze({
 'auth.login':login,'auth.googleLogin':googleLogin,'auth.changePassword':changePassword,
 'auth.logout':logout,'auth.session':session,'auth.linkGoogle':linkGoogle,
 'users.create':createUser,'users.list':listUsers,'users.update':updateUser,'users.suspend':suspend,
 'users.resetPassword':resetPassword,'users.assignRoles':assignRoles
 });
}
