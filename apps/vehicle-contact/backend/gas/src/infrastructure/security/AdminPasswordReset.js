import {createSheetStore} from '../persistence/sheets/SheetStore.js';
import {createGasSecurity} from './GasSecurity.js';

// TRUSTED GAS EDITOR ONLY. Never register this operation as a doGet/doPost route.
// Explicitly approved one-time recovery for the EXISTING admin identity, not bootstrap.
const PREFIX='VEHICLE_ADMIN_RESET_';
const REQ_APPROVAL='RESET_ADMIN_ONCE';
const SHEET_MIME='application/vnd.google-apps.spreadsheet';
const value=(props,key)=>props.getProperty(PREFIX+key);
const invalid=(code)=>{throw new Error(code);};

export function createOneTimeAdminPasswordReset({
 spreadsheetApp,lockService,utilities,propertiesService,driveApp,
 clock=()=>new Date().toISOString()
}) {
 if(!spreadsheetApp||!lockService||!utilities||!propertiesService||!driveApp)
  invalid('RESET_ADAPTERS_NOT_CONFIGURED');
 const props=propertiesService.getScriptProperties();
 function config() {
  const currentSheetId=props.getProperty('VEHICLE_SHEET_ID');
  const targetSheetId=value(props,'EXPECTED_SHEET_ID');
  const expectedUserId=value(props,'EXPECTED_USER_ID');
  const backupId=value(props,'BACKUP_FILE_ID');
  if(!currentSheetId||!targetSheetId||currentSheetId!==targetSheetId
   ||!expectedUserId||!backupId||backupId===currentSheetId)
   invalid('RESET_TARGET_OR_BACKUP_NOT_CONFIRMED');
  // Backups are operator-created, private native Google Sheets copies.
  let backup;
  try{backup=driveApp.getFileById(backupId);}catch(_){invalid('RESET_BACKUP_NOT_ACCESSIBLE');}
  if(!backup||backup.getId()!==backupId
   ||(typeof backup.getMimeType==='function'&&backup.getMimeType()!==SHEET_MIME))
   invalid('RESET_BACKUP_NOT_VERIFIED');
  if(value(props,'STATE'))invalid('RESET_ALREADY_STARTED_OR_COMPLETED');
  return {currentSheetId,expectedUserId};
 }
 function accountState(store,expectedUserId) {
  const user=store.one('vc_users',{username_normalized:'admin'});
  if(!user||user.user_id!==expectedUserId||user.status!=='ACTIVE')
   invalid('RESET_ADMIN_IDENTITY_MISMATCH');
  const roles=store.list('vc_user_roles',{user_id:user.user_id});
  if(!roles.some(r=>r.role_id==='SYSTEM_ADMIN'&&r.status==='ACTIVE'))
   invalid('RESET_ADMIN_ROLE_MISMATCH');
  if(!user.password_hash||!/^pbkdf2-sha256\$\d+\$[a-f0-9]{32}\$[a-f0-9]{64}$/i.test(user.password_hash))
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
 function prepare() {
  const cfg=config();
  const store=createSheetStore({spreadsheetApp,spreadsheetId:cfg.currentSheetId,lockService});
  return {cfg,store};
 }
 function inspect() {
  const {cfg,store}=prepare();
  const state=accountState(store,cfg.expectedUserId);
  newPassword(); // Check presence/policy without printing any value.
  return Object.freeze({
   status:'READY_FOR_EXPLICIT_EDITOR_RESET',account:'admin',role:'SYSTEM_ADMIN',
   sessionsToRevoke:state.sessions.filter(s=>s.status==='ACTIVE'&&!s.revoked_at).length,
   backupVerified:true,credentialsExposed:false,dataModified:false
  });
 }
 function apply() {
  if(value(props,'APPROVAL')!==REQ_APPROVAL)invalid('RESET_EXPLICIT_APPROVAL_REQUIRED');
  const {cfg,store}=prepare();
  accountState(store,cfg.expectedUserId);
  const password=newPassword();
  const security=createGasSecurity({utilities,propertiesService,clock});
  // Compute and self-verify before mutating any row or spending lock time.
  const newHash=security.hashPassword(password);
  if(!security.verifyPassword(password,newHash))invalid('RESET_HASH_SELF_CHECK_FAILED');
  let started=false;
  try {
   const outcome=store.withLock(()=>{
    config(); // Validate again *after* obtaining the lock.
    if(value(props,'APPROVAL')!==REQ_APPROVAL||value(props,'NEW_PASSWORD')!==password)
     invalid('RESET_CONFIGURATION_CHANGED');
    const {user,sessions}=accountState(store,cfg.expectedUserId);
    const timestamp=clock();
    props.setProperty(PREFIX+'STATE','IN_PROGRESS:'+timestamp);
    started=true;
    let revoked=0;
    // Revoke old sessions FIRST. A subsequent write failure cannot leave an
    // existing authenticated session active against a changed password.
    for(const session of sessions) {
     if(session.status==='ACTIVE'&&!session.revoked_at){
      store.update('vc_sessions',{session_id:session.session_id},
       {status:'REVOKED',revoked_at:timestamp});
      revoked++;
     }
    }
    store.update('vc_users',{user_id:user.user_id},{
     password_hash:newHash,password_salt:'',password_change_required:true,updated_at:timestamp
    });
    const verify=store.one('vc_users',{user_id:user.user_id});
    if(verify.password_hash!==newHash||verify.password_change_required!==true)
     invalid('RESET_WRITE_VERIFICATION_FAILED');
    store.insert('vc_change_audit',{
     audit_id:security.secretToken(),actor_id:'SYSTEM',
     entity_type:'account',entity_id:user.user_id,
     action:'EDITOR_ADMIN_PASSWORD_RESET',redacted_summary:'ADMIN_PASSWORD_RESET',
     correlation_id:security.secretToken().slice(0,16),created_at:timestamp
    });
    props.setProperty(PREFIX+'STATE','DONE:'+timestamp);
    return {status:'DONE',account:'admin',sessionsRevoked:revoked,
     mustChangePassword:true,auditRecorded:true,dataModified:true};
   });
   return Object.freeze(outcome);
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
