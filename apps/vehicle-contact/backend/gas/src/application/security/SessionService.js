// Server-authoritative sessions and immutable role-to-permission policy — the legacy engine's side.
// The rules live in shared flows (VC-ADR-046): the session CHECK in application/flows/SessionAuthorizeFlow.js, issue / revoke /
// logout and auth.* in application/flows/AuthFlows.js. The Node core runs the same flows asynchronously. Here they run on the
// synchronous flow runner with this engine's store, snapshot cache, password hashing and Google verification (`run`).
import {ROLE_PERMISSIONS, accessFrom, sessionAuthorizeFlow} from '../flows/SessionAuthorizeFlow.js';
import {issueSessionFlow, revokeUserFlow, endSessionFlow} from '../flows/AuthFlows.js';
import {runFlowSync} from '../flows/FlowRunner.js';
export {ROLE_PERMISSIONS};
export function createSessionService({store,security,cache=null}) {
 const deps=Object.freeze({now:()=>security.now(),id:()=>security.secretToken(),sha256:x=>security.sha256(x)});
 const passwords={hash:p=>security.hashPassword(p),verify:(p,stored)=>security.verifyPassword(p,stored),
  needsRehash:stored=>typeof security.passwordNeedsRehash==='function'&&security.passwordNeedsRehash(stored)};
 const google={verify:idToken=>security.verifyGoogle(idToken)};
 // run any auth flow on this engine (store, snapshot cache, password + Google ports)
 const run=flow=>runFlowSync(flow,{store,cache,passwords,google});
 function permissionsFor(userId) {
  return accessFrom(store.list('vc_user_roles',{user_id:userId}),store.list('vc_user_permissions',{user_id:userId}));
 }
 // authorize: the shared flow (token, revocation, expiry, idle, password-change gate, permission, last_seen touch)
 function authorize(token,permission,{allowPasswordChange=false,fresh=false}={}) {
  return runFlowSync(sessionAuthorizeFlow({token,permission,allowPasswordChange,fresh},{sha256:deps.sha256,now:deps.now}),{store,cache});
 }
 const endSession=actor=>run(endSessionFlow(actor,deps));   // logout: revoke this session, drop its snapshot
 const issue=user=>run(issueSessionFlow(user,deps));
 const revokeUser=userId=>run(revokeUserFlow(userId,deps)); // every ACTIVE session of the user; snapshots dropped
 return Object.freeze({authorize,issue,revokeUser,endSession,permissionsFor,run,deps});
}
