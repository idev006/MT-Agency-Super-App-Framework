import {createGasSecurity} from './GasSecurity.js';
import {parsePasswordHash} from '../../application/security/PasswordHash.js';

// TRUSTED GAS EDITOR ONLY. Never register this operation as a doGet/doPost route.
// Explicitly approved one-time recovery for the EXISTING admin identity, not bootstrap.
// S1 (VC-ADR-029): runs on the runtime store (Firestore). OWNER SECURITY REVIEW ITEM:
// the Sheets-era target/backup gates (EXPECTED_SHEET_ID + a verified Sheets backup copy)
// are replaced by EXPECTED_PROJECT_ID, which must equal the runtime Firestore project.
// All other gates are unchanged: exact approval literal, expected admin user id, SYSTEM_ADMIN
// role, pbkdf2 hash format, strong new-password policy, one-shot STATE, sessions revoked
// BEFORE the password changes, forced password change, audit row, ephemeral secrets deleted.
const PREFIX='VEHICLE_ADMIN_RESET_';
const REQ_APPROVAL='RESET_ADMIN_ONCE';
const COMMIT_CHUNK=400; // Firestore allows 500 writes per commit.
const value=(props,key)=>props.getProperty(PREFIX+key);
const invalid=(code)=>{throw new Error(code);};

export function createOneTimeAdminPasswordReset({store,projectId,utilities,propertiesService,
 clock=()=>new Date().toISOString()}) {
 if(!store||!projectId||!utilities||!propertiesService)invalid('RESET_ADAPTERS_NOT_CONFIGURED');
 const props=propertiesService.getScriptProperties();
 const write=ops=>{
  if(typeof store.writeMany==='function')return store.writeMany(ops);
  for(const o of ops){if(o.op==='insert')store.insert(o.table,o.data);else store.update(o.table,o.key,o.fields);}
  return true;
 };
 function config() {
  const expectedProject=value(props,'EXPECTED_PROJECT_ID');
  const expectedUserId=value(props,'EXPECTED_USER_ID');
  if(!expectedProject||expectedProject!==projectId||!expectedUserId)invalid('RESET_TARGET_NOT_CONFIRMED');
  if(value(props,'STATE'))invalid('RESET_ALREADY_STARTED_OR_COMPLETED');
  return {expectedUserId};
 }
 function accountState(expectedUserId) {
  const user=store.one('vc_users',{username_normalized:'admin'});
  if(!user||user.user_id!==expectedUserId||user.status!=='ACTIVE')
   invalid('RESET_ADMIN_IDENTITY_MISMATCH');
  const roles=store.list('vc_user_roles',{user_id:user.user_id});
  if(!roles.some(r=>r.role_id==='SYSTEM_ADMIN'&&r.status==='ACTIVE'))
   invalid('RESET_ADMIN_ROLE_MISMATCH');
  if(!parsePasswordHash(user.password_hash)) // plain or peppered (application/security/PasswordHash.js)
   invalid('RESET_EXISTING_HASH_FORMAT_INVALID');
  const sessions=store.list('vc_sessions',{user_id:user.user_id});
  if(sessions.length>=5000)invalid('RESET_SESSIONS_EXCEED_SCAN_LIMIT');
  return {user,sessions};
 }
 function newPassword() {
  const password=value(props,'NEW_PASSWORD');
  if(typeof password!=='string'||password.length<16||password.length>128
   ||password!==password.trim()||/[\r\n]/.test(password)
   ||!/[A-Z]/.test(password)||!/[a-z]/.test(password)
   ||!/[0-9]/.test(password)||!/[^A-Za-z0-9]/.test(password))
   invalid('RESET_NEW_PASSWORD_POLICY_FAILED');
  return password;
 }
 function inspect() {
  const cfg=config();
  const state=accountState(cfg.expectedUserId);
  newPassword(); // Check presence/policy without printing any value.
  return Object.freeze({
   status:'READY_FOR_EXPLICIT_EDITOR_RESET',account:'admin',role:'SYSTEM_ADMIN',
   sessionsToRevoke:state.sessions.filter(s=>s.status==='ACTIVE'&&!s.revoked_at).length,
   targetConfirmed:true,credentialsExposed:false,dataModified:false
  });
 }
 function apply() {
  if(value(props,'APPROVAL')!==REQ_APPROVAL)invalid('RESET_EXPLICIT_APPROVAL_REQUIRED');
  const cfg=config();
  accountState(cfg.expectedUserId);
  const password=newPassword();
  const security=createGasSecurity({utilities,propertiesService,clock});
  // Compute and self-verify before mutating anything.
  const newHash=security.hashPassword(password);
  if(!security.verifyPassword(password,newHash))invalid('RESET_HASH_SELF_CHECK_FAILED');
  let started=false;
  try {
   config(); // Validate again immediately before writing.
   if(value(props,'APPROVAL')!==REQ_APPROVAL||value(props,'NEW_PASSWORD')!==password)
    invalid('RESET_CONFIGURATION_CHANGED');
   const {user,sessions}=accountState(cfg.expectedUserId);
   const timestamp=clock();
   props.setProperty(PREFIX+'STATE','IN_PROGRESS:'+timestamp);
   started=true;
   // Revoke old sessions FIRST (field-masked writes, chunked commits). A later failure
   // cannot leave an authenticated session active against a changed password.
   const active=sessions.filter(s=>s.status==='ACTIVE'&&!s.revoked_at);
   for(let i=0;i<active.length;i+=COMMIT_CHUNK)
    write(active.slice(i,i+COMMIT_CHUNK).map(s=>({op:'update',table:'vc_sessions',key:{session_id:s.session_id},
     fields:{status:'REVOKED',revoked_at:timestamp}})));
   // Password + forced change + audit in ONE all-or-nothing commit.
   write([
    {op:'update',table:'vc_users',key:{user_id:user.user_id},fields:{password_hash:newHash,password_salt:'',password_change_required:true,updated_at:timestamp}},
    {op:'insert',table:'vc_change_audit',data:{audit_id:security.secretToken(),actor_id:'SYSTEM',entity_type:'account',entity_id:user.user_id,
     action:'EDITOR_ADMIN_PASSWORD_RESET',redacted_summary:'ADMIN_PASSWORD_RESET',correlation_id:security.secretToken().slice(0,16),created_at:timestamp}}
   ]);
   const verify=store.one('vc_users',{user_id:user.user_id});
   if(verify.password_hash!==newHash||verify.password_change_required!==true)
    invalid('RESET_WRITE_VERIFICATION_FAILED');
   props.setProperty(PREFIX+'STATE','DONE:'+timestamp);
   return Object.freeze({status:'DONE',account:'admin',sessionsRevoked:active.length,
    mustChangePassword:true,auditRecorded:true,dataModified:true});
  }catch(error){
   // Never allow a blind retry after any possibly partial mutation.
   if(started)props.setProperty(PREFIX+'STATE','RECOVERY_REQUIRED:'+clock());
   throw error;
  }finally{
   // Clear the ephemeral password and single-use approval after attempting a write.
   if(started){
    props.deleteProperty(PREFIX+'NEW_PASSWORD');
    props.deleteProperty(PREFIX+'APPROVAL');
   }
  }
 }
 return Object.freeze({inspect,apply});
}
