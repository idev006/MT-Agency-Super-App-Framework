// Server-authoritative sessions and immutable role-to-permission policy.
// The session CHECK (authorize) lives in ONE place — application/flows/SessionAuthorizeFlow.js — and runs here through the
// synchronous flow runner; the Node core runs the same flow asynchronously (VC-ADR-046 phase 2b). Issue / revoke / logout
// stay here until auth moves to the core (phase 3).
import {ROLE_PERMISSIONS, accessFrom, sessionCacheKey as cacheKey, sessionAuthorizeFlow} from '../flows/SessionAuthorizeFlow.js';
import {runFlowSync} from '../flows/FlowRunner.js';
export {ROLE_PERMISSIONS};
export function createSessionService({store,security,cache=null}) {
 function permissionsFor(userId) {
  return accessFrom(store.list('vc_user_roles',{user_id:userId}),store.list('vc_user_permissions',{user_id:userId}));
 }
 // authorize: the shared flow (token, revocation, expiry, idle, password-change gate, permission, last_seen touch)
 function authorize(token,permission,{allowPasswordChange=false,fresh=false}={}) {
  return runFlowSync(sessionAuthorizeFlow({token,permission,allowPasswordChange,fresh},{sha256:x=>security.sha256(x),now:()=>security.now()}),{store,cache});
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
  const access=permissionsFor(user.user_id);
  store.sequence(()=>store.insert('vc_sessions',{
   session_id:security.secretToken(),user_id:user.user_id,token_digest:security.sha256(token),
   status:'ACTIVE',issued_at:date,expires_at:expires,last_seen_at:date,idle_timeout_minutes:idle,revoked_at:'',
   access_json:JSON.stringify({roles:access.roles,permissions:access.permissions})
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
