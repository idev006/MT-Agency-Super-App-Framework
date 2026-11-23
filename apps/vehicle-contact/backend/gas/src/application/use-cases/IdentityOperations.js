import {ROLE_PERMISSIONS} from '../security/SessionService.js';
import {paginate} from '../pagination/Pagination.js';
// Static dummy hash with the same PBKDF2 cost as GasSecurity.hashPassword (150000 rounds).
// Used for unknown/inactive users so login always performs equal work (no username-enumeration timing oracle).
const DUMMY_PASSWORD_HASH='pbkdf2-sha256$150000$'+'0'.repeat(32)+'$'+'0'.repeat(64);
export function createIdentityOperations({store,security,sessions}) {
 const required=(value,name,max=256)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error('INVALID_'+name);return value.trim();};
 const text=v=>required(v,'TEXT').replace(/[\r\n]/g,' ');
 const changed=(event,actor,target,summary=event,identity={})=>store.insert('vc_change_audit',{audit_id:identity.auditId||security.secretToken(),actor_id:actor||'SYSTEM',entity_type:'account',entity_id:target,action:event,redacted_summary:summary,correlation_id:identity.correlationId||security.secretToken().slice(0,16),created_at:security.now()});
 const sortedRoles=roles=>[...new Set(roles.map(String))].sort();
 const sameRoles=(left,right)=>JSON.stringify(sortedRoles(left))===JSON.stringify(sortedRoles(right));
 const activeRoles=userId=>store.list('vc_user_roles',{user_id:userId}).filter(r=>r.status==='ACTIVE').map(r=>String(r.role_id));
 const latestJournal=(operation,entityId)=>store.listNewest('vc_operation_journal',{operation,entity_id:entityId},20).at(-1)||null;
 const parseJournal=row=>{try{return JSON.parse(row?.detail_json||'{}');}catch{return {};}};
 function replaceRoles(userId,roles){
  for(const row of store.list('vc_user_roles',{user_id:userId}))store.remove('vc_user_roles',{assignment_id:row.assignment_id});
  for(const role of [...new Set(roles.map(String))])store.insert('vc_user_roles',{assignment_id:security.secretToken(),user_id:userId,role_id:role,status:'ACTIVE'});
 }
 function ensureRoleAudit(detail){
  if(!store.one('vc_change_audit',{audit_id:detail.auditId}))changed('ROLES_CHANGED',detail.actorId,detail.userId,
   'roles:'+detail.beforeRoles.join(',')+'->'+detail.desiredRoles.join(','),{auditId:detail.auditId,correlationId:detail.correlationId});
 }
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
  const rolesByUser=new Map();
  for(const r of store.list('vc_user_roles')){
   if(r.status!=='ACTIVE')continue;
   const uid=String(r.user_id);
   if(!rolesByUser.has(uid))rolesByUser.set(uid,[]);
   rolesByUser.get(uid).push(String(r.role_id));
  }
  const items=store.list('vc_users').map(u=>({
   userId:u.user_id,username:u.username_normalized,displayName:u.display_name,organizationId:u.org_id,status:u.status,
   roles:rolesByUser.get(String(u.user_id))||[]
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
  if(!Array.isArray(p.roles)||!p.roles.length||p.roles.some(r=>!Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS,r)))
   throw new Error('INVALID_ROLES');
  const roles=[...new Set(p.roles)];
  if(roles.includes('RETENTION_WORKER')&&roles.length>1)throw new Error('INVALID_ROLES');
  const result=store.withLock(()=>{
   if(!store.one('vc_users',{user_id:id}))throw new Error('NOT_FOUND');
   const current=sortedRoles(activeRoles(id));
   const previous=latestJournal('users.assignRoles',id),prior=parseJournal(previous);
   const authorizationBaseline=previous&&['PREPARED','RECOVERY_REQUIRED'].includes(previous.status)?sortedRoles(prior.beforeRoles||[]):current;
   if(id===actor.userId&&!roles.includes('SYSTEM_ADMIN'))throw new Error('SELF_DEMOTION_DENIED');
   if(id===actor.userId&&roles.some(role=>!authorizationBaseline.includes(role)))throw new Error('SELF_ROLE_EXPANSION_DENIED');
   if(previous&&['PREPARED','RECOVERY_REQUIRED'].includes(previous.status)){
    if(!sameRoles(prior.desiredRoles||[],roles))throw new Error('OPERATION_RECOVERY_REQUIRED');
    try{
     replaceRoles(id,roles);ensureRoleAudit(prior);
     store.update('vc_operation_journal',{event_id:previous.event_id},{status:'APPLIED'});
     return {userId:id,roles};
    }catch(error){
     try{store.update('vc_operation_journal',{event_id:previous.event_id},{status:'RECOVERY_REQUIRED'});}catch{}
     throw new Error('OPERATION_RECOVERY_REQUIRED');
    }
   }
   if(previous&&previous.status==='APPLIED'&&sameRoles(prior.desiredRoles||[],roles)){
    if(!sameRoles(current,roles))throw new Error('OPERATION_RECOVERY_REQUIRED');
    ensureRoleAudit(prior);return {userId:id,roles};
   }
   const eventId=security.secretToken(),detail={operation:'users.assignRoles',userId:id,actorId:actor.userId,
    beforeRoles:current,desiredRoles:sortedRoles(roles),auditId:security.secretToken(),correlationId:security.secretToken().slice(0,16)};
   store.insert('vc_operation_journal',{event_id:eventId,operation:'users.assignRoles',entity_id:id,actor_id:actor.userId,
    status:'PREPARED',detail_json:JSON.stringify(detail),created_at:security.now()});
   let rolesApplied=false;
   try{
    replaceRoles(id,roles);rolesApplied=true;ensureRoleAudit(detail);
    store.update('vc_operation_journal',{event_id:eventId},{status:'APPLIED'});
    return {userId:id,roles};
   }catch(error){
    if(rolesApplied){
     try{store.update('vc_operation_journal',{event_id:eventId},{status:'RECOVERY_REQUIRED',detail_json:JSON.stringify({...detail,recovery:{stage:'DESIRED_ROLES_APPLIED'}})});}catch{}
     throw new Error('OPERATION_RECOVERY_REQUIRED');
    }
    const errors=[];
    try{replaceRoles(id,current);}catch(compensationError){errors.push(String(compensationError?.message||'COMPENSATION_FAILED').slice(0,64));}
    try{store.update('vc_operation_journal',{event_id:eventId},{status:errors.length?'RECOVERY_REQUIRED':'ROLLED_BACK',
     detail_json:JSON.stringify({...detail,recovery:{stage:'ROLE_REPLACEMENT',errors}})});}catch{errors.push('JOURNAL_UPDATE_FAILED');}
    if(errors.length)throw new Error('OPERATION_RECOVERY_REQUIRED');
    throw error;
   }
  });
  sessions.revokeUser(id);return result;
 }
 return Object.freeze({
 'auth.login':login,'auth.googleLogin':googleLogin,'auth.changePassword':changePassword,
 'auth.logout':logout,'auth.session':session,'auth.linkGoogle':linkGoogle,
 'users.create':createUser,'users.list':listUsers,'users.update':updateUser,'users.suspend':suspend,
 'users.resetPassword':resetPassword,'users.assignRoles':assignRoles
 });
}
