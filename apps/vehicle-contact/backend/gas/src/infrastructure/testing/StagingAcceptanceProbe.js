// Google Apps Script Editor-only REAL staging probes. Not routed by doGet/doPost.
// All reads/writes are explicitly pinned to an isolated synthetic 24-tab spreadsheet.
import {createApplication} from '../../composition/Container.js';
import {createSheetStore} from '../persistence/sheets/SheetStore.js';
const SANDBOX_ID='1kmUaBUC8slFICGLzxpNEUBsU87Sf-tnfe32AUs208As';
const SANDBOX_LABEL='P6VC — Backend Acceptance Test Sandbox (Synthetic Only) — 2026-11-17';
const PASSWORD='P6VC-Test-Only-2026-11-17!';
const QR_TOKEN='deadbeef'.repeat(8);
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/C7sAAAAASUVORK5CYII=';
const ROLES=['test_sysadmin','test_registration','test_staff','test_owner','test_worker','test_firstlogin'];
function validateSandbox(spreadsheetApp) {
 const book=spreadsheetApp.openById(SANDBOX_ID);
 if(book.getName()!==SANDBOX_LABEL||book.getSheets().length!==24)
  throw new Error('SANDBOX_ID_OR_SCHEMA_GUARD_FAILED');
 const users=book.getSheetByName('vc_users');
 if(!users||users.getLastRow()<7)throw new Error('SANDBOX_TEST_USERS_MISSING');
 const names=users.getRange(2,2,6,1).getDisplayValues().map(r=>r[0]);
 if(ROLES.some(n=>!names.includes(n)))throw new Error('SANDBOX_TEST_USER_GUARD_FAILED');
 return book;
}
function deps({spreadsheetApp,lockService,utilities,driveApp,urlFetchApp,folderId=''}) {
 const values=Object.freeze({
  VEHICLE_API_ENABLED:'true',
  VEHICLE_SHEET_ID:SANDBOX_ID,
  VEHICLE_AUTH_PEPPER:'P6VC-ISOLATED-SYNTHETIC-PEPPER-NOT-PROD-2026',
  VEHICLE_PHOTOS_FOLDER_ID:folderId,
  VEHICLE_RETENTION_EXECUTE_ENABLED:'true'
 });
 return {spreadsheetApp,lockService,utilities,driveApp,urlFetchApp,
  propertiesService:{getScriptProperties(){return{getProperty:name=>Object.prototype.hasOwnProperty.call(values,name)?values[name]:null};}}
 };
}
function makeRunner(options) {
 validateSandbox(options.spreadsheetApp);
 const env=deps(options),application=createApplication(env);
 const request=(op,payload={},token=null)=>{
  const pos=op.indexOf('.');
  return application.dispatch({
   apiVersion:'v1',group:op.slice(0,pos),action:op.slice(pos+1),payload,
   ...(token?{sessionToken:token}:{}),
   requestId:'syntheticEditorAcceptance'
  },'POST');
 };
 const reports=[];
 const test=(id,fn)=>{
  try{fn();reports.push({id,result:'PASS'});}
  catch(e){reports.push({id,result:'FAIL',reason:String(e&&e.message||'UNKNOWN').slice(0,100)});}
 };
 const ok=(r,description)=>{
  if(!r||r.ok!==true)throw new Error(description+':'+(r?.error?.code||'NO_RESPONSE'));
  return r.data;
 };
 const denied=(r,code,description)=>{
  if(!r||r.ok!==false||r.error?.code!==code)
   throw new Error(description+':EXPECTED_'+code+'_GOT_'+(r?.error?.code||r?.ok));
 };
 const login=name=>ok(request('auth.login',{username:name,password:PASSWORD}),'LOGIN_'+name).sessionToken;
 const finalize=phase=>({
  phase,environment:'ISOLATED_GAS_EDITOR_AND_REAL_SHEETS',
  sandboxId:SANDBOX_ID,tests:reports.length,passed:reports.filter(x=>x.result==='PASS').length,
  failed:reports.filter(x=>x.result==='FAIL').length,cases:reports
 });
 return {request,test,ok,denied,login,finalize,env};
}
export function runStagingAuthAcceptance(options) {
 const h=makeRunner(options),sessions={};
 h.test('GAS-AUTH-01.SCHEMA',()=>{
  const res=createApplication(h.env).verifySchema();
  if(!res.ok||res.mismatches.length)throw Error('SCHEMA_MISMATCH');
 });
 h.test('GAS-AUTH-02.HEALTH',()=>{
  if(h.ok(h.request('system.health'),'health').status!=='bootstrap')throw Error('INVALID_HEALTH');
 });
 for(const name of ROLES)h.test('GAS-AUTH-LOGIN.'+name,()=>{
  sessions[name]=h.login(name);
  const r=h.ok(h.request('auth.session',{},sessions[name]),'session');
  if(!Array.isArray(r.roles)||r.roles.length===0)throw Error('ROLE_EMPTY');
 });
 h.test('GAS-AUTH-RBAC.SYS_CONFIG',()=>{
  if(h.ok(h.request('system.config.get',{},sessions.test_sysadmin),'config').idle_timeout_minutes!=='30')throw Error('SETTING_INVALID');
 });
 h.test('GAS-AUTH-RBAC.STAFF_DENIED',()=>{
  h.denied(h.request('system.config.get',{},sessions.test_staff),'FORBIDDEN','staff-admin-denied');
 });
 h.test('GAS-AUTH-RBAC.SYS_NOT_REG_APPROVER',()=>{
  h.denied(h.request('registrations.listPending',{},sessions.test_sysadmin),'FORBIDDEN','sys-reg-denied');
 });
 h.test('GAS-AUTH-LOOKUP.STAFF',()=>{
  const v=h.ok(h.request('vehicles.lookup',{plate:'กข 1234',province:'TH-10'},sessions.test_staff),'lookup');
  if(v.vehicleId!=='vehicle-sandbox-001'||v.photos.length!==5||v.contacts.length!==1)throw Error('LOOKUP_DATA_MISMATCH');
 });
 h.test('GAS-AUTH-CONTACT.READ',()=>{
  const c=h.ok(h.request('contacts.read',{vehicleId:'vehicle-sandbox-001'},sessions.test_staff),'contacts');
  if(c.length!==1||c[0].phone!=='+66810000001')throw Error('CONTACT_MISMATCH');
 });
 h.test('GAS-AUTH-QR.RESOLVE',()=>{
  const v=h.ok(h.request('qr.resolve',{token:QR_TOKEN},sessions.test_staff),'QR');
  if(v?.vehicleId!=='vehicle-sandbox-001')throw Error('QR_MISMATCH');
 });
 h.test('GAS-AUTH-RBAC.OWNER_DENIED',()=>{
  h.denied(h.request('contacts.read',{vehicleId:'vehicle-sandbox-001'},sessions.test_owner),'FORBIDDEN','owner-contact-denied');
 });
 h.test('GAS-AUTH-RBAC.WORKER_DENIED',()=>{
  h.denied(h.request('users.list',{},sessions.test_worker),'FORBIDDEN','worker-user-list-denied');
 });
 h.test('GAS-AUTH.INITIAL_CHANGE_REQUIRED',()=>{
  const status=h.ok(h.request('auth.session',{},sessions.test_firstlogin),'first-login');
  if(status.mustChangePassword!==true)throw Error('FIRST_CHANGE_FLAG_NOT_SET');
  h.denied(h.request('organizations.list',{},sessions.test_firstlogin),'PASSWORD_CHANGE_REQUIRED','initial-password-policy');
 });
 h.test('GAS-AUTH.BAD_CREDENTIALS',()=>{
  h.denied(h.request('auth.login',{username:'test_staff',password:'wrong-dummy-only'}),'INVALID_CREDENTIALS','bad-pass');
  h.denied(h.request('auth.login',{username:'missing-sandbox-user',password:'wrong-dummy-only'}),'INVALID_CREDENTIALS','unknown-user');
 });
 h.test('GAS-AUTH.LOGOUT_REVOKE',()=>{
  const token=sessions.test_staff;
  h.ok(h.request('auth.logout',{},token),'logout');
  h.denied(h.request('auth.session',{},token),'UNAUTHENTICATED','revoked-token');
 });
 return h.finalize('AUTH_AND_READ');
}
export function runStagingLifecycleAcceptance(options) {
 const book=validateSandbox(options.spreadsheetApp);
 const folder=options.driveApp.createFolder('P6VC-SYNTHETIC-ACCEPTANCE-'+Date.now());
 const h=makeRunner({...options,folderId:folder.getId()});
 let sys=null,reg=null,staff=null,owner=null,worker=null;
 let campaign=null,registration=null,approved=null,rotated=null,change=null,job=null;
 const uniquePlate='TST'+String(Date.now()%10000000);
 h.test('GAS-FLOW.LOGIN_ACTORS',()=>{
  sys=h.login('test_sysadmin');reg=h.login('test_registration');staff=h.login('test_staff');
  owner=h.login('test_owner');worker=h.login('test_worker');
 });
 h.test('GAS-FLOW.CAMPAIGN',()=>{
  const now=Date.now();
  campaign=h.ok(h.request('campaigns.create',{startsAt:new Date(now-120000).toISOString(),
    endsAt:new Date(now+3600000).toISOString(),maxSubmissions:2},sys),'campaign');
  if(!campaign.campaignToken)throw Error('TOKEN_MISSING');
 });
 const photos=[];
 for(const slot of ['FRONT','REAR','LEFT','RIGHT','FRONT_ANGLE'])h.test('GAS-FLOW.MEDIA_'+slot,()=>{
  const p=h.ok(h.request('photos.upload',{campaignToken:campaign.campaignToken,slot,
    base64Image:PNG,mimeType:'image/png'}),'photo-upload');
  photos.push({slot,photoId:p.photoId});
 });
 h.test('GAS-FLOW.REGISTRATION_SUBMIT',()=>{
  registration=h.ok(h.request('registrations.submit',{
   campaignToken:campaign.campaignToken,plate:uniquePlate,province:'TH-10',
   plateType:'PRIVATE',vehicleType:'SEDAN',brand:'SYNTHETIC',model:'ACCEPTANCE',color:'WHITE',
   organizationId:'org-test-police',relationship:'REGISTERED_CONTACT',
   contactName:'Synthetic Lifecycle Contact',contactPhone:'+66810000002',
   photos,idempotencyKey:'test-'+uniquePlate
  }),'submit');
  if(registration.status!=='PENDING_APPROVAL')throw Error('NOT_PENDING');
 });
 h.test('GAS-FLOW.PENDING_VISIBLE',()=>{
  if(!h.ok(h.request('registrations.listPending',{},reg),'pending').some(r=>r.requestId===registration.requestId))
   throw Error('PENDING_NOT_VISIBLE');
 });
 h.test('GAS-FLOW.APPROVE',()=>{
  approved=h.ok(h.request('registrations.review',{requestId:registration.requestId,decision:'APPROVE',platePhotoVerified:true},reg),'approve');
  if(!approved.qrToken)throw Error('QR_MISSING');
 });
 h.test('GAS-FLOW.STAFF_LOOKUP',()=>{
  const v=h.ok(h.request('vehicles.lookup',{plate:uniquePlate,province:'TH-10'},staff),'lookup');
  if(v.vehicleId!==approved.vehicleId||v.photos.length!==5)throw Error('LOOKUP_FAILED');
 });
 h.test('GAS-FLOW.REGISTER_OWNER',()=>{
  h.ok(h.request('vehicles.update',{vehicleId:approved.vehicleId,expectedVersion:1,ownerUserId:'u-sandbox-4'},reg),'assign-owner');
 });
 h.test('GAS-FLOW.OWNER_PROPOSE',()=>{
  change=h.ok(h.request('changes.submit',{vehicleId:approved.vehicleId,color:'ORANGE'},owner),'owner-change');
  if(change.status!=='PENDING')throw Error('NOT_PENDING');
 });
 h.test('GAS-FLOW.REG_APPROVE_CHANGE',()=>{
  h.ok(h.request('changes.review',{requestId:change.requestId,decision:'APPROVE'},reg),'change-approve');
 });
 h.test('GAS-FLOW.ROTATE_QR',()=>{
  rotated=h.ok(h.request('qr.replace',{vehicleId:approved.vehicleId},reg),'rotate');
  if(h.ok(h.request('qr.resolve',{token:approved.qrToken},staff),'old-token')!==null)throw Error('OLD_QR_ACTIVE');
  if(h.ok(h.request('qr.resolve',{token:rotated.token},staff),'new-token')?.vehicleId!==approved.vehicleId)
   throw Error('NEW_QR_NOT_RESOLVED');
 });
 h.test('GAS-FLOW.REPLACE_PHOTO',()=>{
  h.ok(h.request('photos.replace',{vehicleId:approved.vehicleId,slot:'FRONT',base64Image:PNG,mimeType:'image/png'},reg),'photo-replace');
 });
 h.test('GAS-FLOW.CANCEL',()=>{
  h.ok(h.request('vehicles.cancel',{vehicleId:approved.vehicleId},reg),'cancel');
  if(h.ok(h.request('qr.resolve',{token:rotated.token},staff),'cancelled-QR')!==null)throw Error('CANCELLED_QR_ACTIVE');
 });
 h.test('GAS-FLOW.RETENTION_DUE_FIXTURE',()=>{
  const store=createSheetStore({spreadsheetApp:options.spreadsheetApp,spreadsheetId:SANDBOX_ID,lockService:options.lockService});
  job=store.list('vc_retention_jobs',{vehicle_id:approved.vehicleId})[0];
  if(!job)throw Error('MISSING_RETENTION_JOB');
  store.withLock(()=>store.update('vc_retention_jobs',{job_id:job.job_id},{
   due_at:new Date(Date.now()-60000).toISOString()
  }));
 });
 h.test('GAS-FLOW.SYS_APPROVE_RETENTION',()=>{
  h.ok(h.request('retention.approve',{jobId:job.job_id},sys),'retention-approve');
 });
 h.test('GAS-FLOW.WORKER_DELETE',()=>{
  const result=h.ok(h.request('retention.execute',{jobId:job.job_id},worker),'retention-execute');
  if(result.status!=='DELETION_COMPLETED')throw Error('NOT_DELETED');
 });
 h.test('GAS-FLOW.VERIFY_DELETE_AUDIT',()=>{
  const store=createSheetStore({spreadsheetApp:options.spreadsheetApp,spreadsheetId:SANDBOX_ID,lockService:options.lockService});
  if(store.one('vc_vehicles',{vehicle_id:approved.vehicleId})!==null)throw Error('VEHICLE_STILL_PRESENT');
  if(store.list('vc_vehicle_photos',{vehicle_id:approved.vehicleId}).length)throw Error('PHOTOS_STILL_PRESENT');
  if(!store.list('vc_change_audit',{entity_id:approved.vehicleId}).length)throw Error('AUDIT_ERASED');
 });
 const result=h.finalize('FULL_LIFECYCLE');
 result.privateTestFolderId=folder.getId();result.syntheticPlate=uniquePlate;
 return result;
}
