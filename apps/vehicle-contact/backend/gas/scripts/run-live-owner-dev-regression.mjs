// Owner-authorized development regression against the pinned P6VC GAS Web App.
// This script creates synthetic records, disables/suspends them during cleanup,
// and never prints credentials, session tokens, raw responses, or personal data.
// The case list is transport-agnostic (createRegressionCases): the live GAS HTTP
// runner below and the Node→Firestore local pipeline suite share ONE case source.
import './load-env.mjs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const inventory=JSON.parse(fs.readFileSync(new URL('../../../contracts/api-inventory.v1.json',import.meta.url),'utf8'));
const expectedOperations=new Set(inventory.operations.map(x=>x.group+'.'+x.action));

// Transport-agnostic full-inventory regression. `request(operation,payload,token)`
// must return the standard {ok,data,error} envelope. `persist` is called after every
// recorded test/cleanup so partial progress survives interruption.
export function createRegressionCases({request:rawRequest,username,testPassword,tag,report,persist=()=>{}}){
 const state={users:{},tokens:{},photos:[]};
 const covered=new Set();
 let adminToken=null;
 const request=(operation,payload={},token=null)=>{covered.add(operation);return rawRequest(operation,payload,token);};
 const actorInitial='P6VC-Actor-'+crypto.randomBytes(10).toString('hex')+'!Aa9';
 const actorActive='P6VC-Active-'+crypto.randomBytes(10).toString('hex')+'!Aa9';
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/C7sAAAAASUVORK5CYII=';
 function ok(body){
  if(body.ok!==true)throw Error(body.error?.code||'API_FAILED');
  return body.data;
 }
 function denied(body,errorCode){
  if(body.ok!==false||body.error?.code!==errorCode)
   throw Error('EXPECTED_'+errorCode+'_GOT_'+(body.error?.code||String(body.ok)));
 }
 async function test(id,operation,fn){
  const started=Date.now();
  try{await fn();report.tests.push({id,operation,status:'PASS',durationMs:Date.now()-started});persist();return true;}
  catch(error){report.tests.push({id,operation,status:'FAIL',durationMs:Date.now()-started,
   reason:String(error?.message||error).slice(0,120)});persist();return false;}
 }
 async function cleanup(id,fn){
  try{await fn();report.cleanup.push({id,status:'PASS'});persist();}
  catch(error){report.cleanup.push({id,status:'FAIL',reason:String(error?.message||error).slice(0,120)});persist();}
 }
 const login=async(user,password)=>ok(await request('auth.login',{username:user,password})).sessionToken;

 async function run(){
  await test('HEALTH','system.health',async()=>{
   const data=ok(await request('system.health'));assert.equal(data.status,'ready');assert.equal(data.apiVersion,'v1');
  });
  await test('AUTH.INVALID_LOGIN','auth.login',async()=>denied(await request('auth.login',{}),'INVALID_REQUEST'));
  adminToken=await login(username,testPassword);
  await test('AUTH.SESSION.AUTOMATION_ADMIN','auth.session',async()=>{
   const session=ok(await request('auth.session',{},adminToken));
   assert.ok(session.roles.includes('SYSTEM_ADMIN'));
   assert.equal(session.mustChangePassword,false);
  });
  await test('AUTH.GOOGLE_LOGIN.NEGATIVE','auth.googleLogin',async()=>
   denied(await request('auth.googleLogin',{idToken:'invalid-development-token'}),'OPERATION_FAILED'));
  await test('AUTH.LINK_GOOGLE.NEGATIVE','auth.linkGoogle',async()=>
   denied(await request('auth.linkGoogle',{password:testPassword,idToken:'invalid-development-token'},adminToken),'OPERATION_FAILED'));

  let settings;
  await test('SYSTEM.CONFIG.GET','system.config.get',async()=>{settings=ok(await request('system.config.get',{},adminToken));});
  await test('SYSTEM.CONFIG.UPDATE','system.config.update',async()=>{
   const idle=Math.max(1,Number(settings?.idle_timeout_minutes)||30);
   const retention=Math.max(1,Number(settings?.retention_days)||365);
   const data=ok(await request('system.config.update',{values:{idle_timeout_minutes:idle,retention_days:retention}},adminToken));
   assert.equal(Number(data.idle_timeout_minutes),idle);assert.equal(Number(data.retention_days),retention);
  });

  const actorRoles={reg:'REGISTRATION_ADMIN',staff:'STAFF',owner:'OWNER',worker:'RETENTION_WORKER'};
  for(const [kind,role] of Object.entries(actorRoles)){
   const actorUsername=('p6vc_'+kind+'_'+tag).slice(0,80);
   await test('USERS.CREATE.'+kind,'users.create',async()=>{
    const data=ok(await request('users.create',{username:actorUsername,displayName:'P6VC Automated '+kind,
     temporaryPassword:actorInitial},adminToken));
    state.users[kind]={userId:data.userId,username:actorUsername,role};
   });
   await test('USERS.ASSIGN_ROLES.'+kind,'users.assignRoles',async()=>{
    const data=ok(await request('users.assignRoles',{userId:state.users[kind].userId,roles:[role]},adminToken));
    assert.ok(data.roles.includes(role));
   });
  }
  await test('USERS.LIST','users.list',async()=>{
   // Page through the whole directory: DEV accumulates suspended suite users, so the newest
   // users fall outside a single limit-100 window (G6 V62 false FAIL at 102 users, 2026-11-24).
   const rows=[];
   for(let page=1;;page++){
    const data=ok(await request('users.list',{page,pageSize:100},adminToken));
    rows.push(...data.items);
    if(page>=data.totalPages||page>=20)break;
   }
   assert.ok(Object.values(state.users).every(u=>rows.some(x=>x.userId===u.userId)));
  });
  await test('USERS.UPDATE','users.update',async()=>{
   const data=ok(await request('users.update',{userId:state.users.staff.userId,displayName:'P6VC Automated Staff Updated'},adminToken));
   assert.equal(data.updated,true);
  });
  await test('USERS.RESET_PASSWORD','users.resetPassword',async()=>{
   const data=ok(await request('users.resetPassword',{userId:state.users.worker.userId,temporaryPassword:actorInitial},adminToken));
   assert.equal(data.reset,true);
  });
  for(const [kind,user] of Object.entries(state.users)){
   const token=await login(user.username,actorInitial);
   await test('AUTH.SESSION.'+kind,'auth.session',async()=>{
    const data=ok(await request('auth.session',{},token));assert.equal(data.mustChangePassword,true);
   });
   await test('AUTH.CHANGE_PASSWORD.'+kind,'auth.changePassword',async()=>{
    ok(await request('auth.changePassword',{oldPassword:actorInitial,newPassword:actorActive},token));
   });
   state.tokens[kind]=await login(user.username,actorActive);
  }

  await test('ORGANIZATIONS.CREATE','organizations.create',async()=>{
   state.org=ok(await request('organizations.create',{name:'P6VC Automated '+tag,type:'EXTERNAL'},adminToken));
  });
  await test('ORGANIZATIONS.LIST','organizations.list',async()=>{
   const rows=ok(await request('organizations.list',{limit:100},adminToken));
   assert.ok(rows.some(x=>(x.organizationId||x.organization_id)===state.org.organizationId));
  });
  await test('ORGANIZATIONS.UPDATE','organizations.update',async()=>{
   const data=ok(await request('organizations.update',{organizationId:state.org.organizationId,name:'P6VC Automated Updated '+tag},adminToken));
   assert.equal(data.updated,true);
  });
  await test('CAMPAIGNS.CREATE','campaigns.create',async()=>{
   const now=Date.now();state.campaign=ok(await request('campaigns.create',{
    startsAt:new Date(now-60000).toISOString(),endsAt:new Date(now+3600000).toISOString(),maxSubmissions:3
   },adminToken));assert.ok(state.campaign.campaignToken);
  });
  await test('CAMPAIGNS.LIST','campaigns.list',async()=>{
   const rows=ok(await request('campaigns.list',{limit:100},adminToken));
   assert.ok(rows.some(x=>x.campaignId===state.campaign.campaignId));
  });
  await test('CAMPAIGNS.VALIDATE','campaigns.validate',async()=>{
   assert.equal(ok(await request('campaigns.validate',{campaignToken:state.campaign.campaignToken})).valid,true);
  });
  await test('REFERENCES.REGISTRATION','references.registration',async()=>{
   const catalog=ok(await request('references.registration',{},state.tokens.reg));
   assert.ok(['LEGACY','ADVISORY','ENFORCED'].includes(catalog.mode));
   assert.equal(typeof catalog.version,'string');
  });
  for(const slot of ['FRONT','REAR','LEFT','RIGHT','FRONT_ANGLE'])await test('PHOTOS.UPLOAD.'+slot,'photos.upload',async()=>{
   const data=ok(await request('photos.upload',{campaignToken:state.campaign.campaignToken,slot,base64Image:png,mimeType:'image/png'}));
   state.photos.push({slot,photoId:data.photoId});
  });
  const plate='TST'+String(Date.now()).slice(-8);
  const registration={campaignToken:null,plate,province:'TH-10',plateType:'PRIVATE',vehicleType:'SEDAN',
   brand:'SYNTHETIC',model:'AUTOMATED',color:'WHITE',organizationId:null,relationship:'REGISTERED_CONTACT',
   contactName:'Synthetic Automated Contact',contactPhone:'+66810000002',photos:state.photos,idempotencyKey:'auto-'+plate};
  await test('REGISTRATIONS.SUBMIT','registrations.submit',async()=>{
   // Resolve upstream state INSIDE the test so an earlier failure is recorded as a test
   // FAIL instead of aborting the whole run with an uncaught TypeError.
   registration.campaignToken=state.campaign.campaignToken;registration.organizationId=state.org.organizationId;
   state.registration=ok(await request('registrations.submit',registration));assert.equal(state.registration.status,'PENDING_APPROVAL');
   const replay=ok(await request('registrations.submit',registration));assert.equal(replay.requestId,state.registration.requestId);
  });
  await test('REGISTRATIONS.LIST_PENDING','registrations.listPending',async()=>{
   const rows=ok(await request('registrations.listPending',{limit:100},state.tokens.reg));
   assert.ok(rows.some(x=>x.requestId===state.registration.requestId));
  });
  await test('REGISTRATIONS.DETAIL','registrations.detail',async()=>{
   assert.equal(ok(await request('registrations.detail',{requestId:state.registration.requestId},state.tokens.reg)).requestId,state.registration.requestId);
  });
  await test('REGISTRATIONS.PHOTO','registrations.photo',async()=>{
   const detail=ok(await request('registrations.detail',{requestId:state.registration.requestId},state.tokens.reg));
   const first=detail.application.photos[0];
   const photo=ok(await request('registrations.photo',{requestId:state.registration.requestId,photoId:first.photoId},state.tokens.reg));
   assert.equal(photo.photoId,first.photoId);assert.equal(photo.slot,first.slot);
   assert.ok(typeof photo.base64Image==='string'&&photo.base64Image.length>0);
  });
  await test('REGISTRATIONS.REVIEW','registrations.review',async()=>{
   state.approved=ok(await request('registrations.review',{requestId:state.registration.requestId,decision:'APPROVE',platePhotoVerified:true},state.tokens.reg));
   assert.equal(state.approved.status,'APPROVED');
  });
  await test('VEHICLES.LOOKUP','vehicles.lookup',async()=>{
   assert.equal(ok(await request('vehicles.lookup',{plate,province:'TH-10'},state.tokens.staff)).vehicleId,state.approved.vehicleId);
  });
  await test('VEHICLES.DETAIL','vehicles.detail',async()=>{
   assert.equal(ok(await request('vehicles.detail',{vehicleId:state.approved.vehicleId},state.tokens.staff)).vehicleId,state.approved.vehicleId);
  });
  await test('PHOTOS.LIST','photos.list',async()=>{
   assert.equal(ok(await request('photos.list',{vehicleId:state.approved.vehicleId},state.tokens.staff)).length,5);
  });
  await test('VEHICLES.PHOTO','vehicles.photo',async()=>{
   const list=ok(await request('photos.list',{vehicleId:state.approved.vehicleId},state.tokens.staff));
   const photo=ok(await request('vehicles.photo',{vehicleId:state.approved.vehicleId,photoId:list[0].photoId},state.tokens.staff));
   assert.equal(photo.photoId,list[0].photoId);assert.equal(photo.slot,list[0].slot);
   assert.ok(typeof photo.base64Image==='string'&&photo.base64Image.length>0);
  });
  await test('CONTACTS.READ','contacts.read',async()=>{
   assert.ok(ok(await request('contacts.read',{vehicleId:state.approved.vehicleId},state.tokens.staff)).length>0);
  });
  await test('CONTACTS.UPDATE','contacts.update',async()=>{
   assert.equal(ok(await request('contacts.update',{vehicleId:state.approved.vehicleId,contactName:'Synthetic Updated',
    contactPhone:'+66810000003'},state.tokens.reg)).updated,true);
  });
  await test('VEHICLES.UPDATE','vehicles.update',async()=>{
   const data=ok(await request('vehicles.update',{vehicleId:state.approved.vehicleId,expectedVersion:1,
    ownerUserId:state.users.owner.userId},state.tokens.reg));assert.equal(data.version,2);
  });
  await test('VEHICLES.HISTORY','vehicles.history',async()=>{
   assert.ok(ok(await request('vehicles.history',{vehicleId:state.approved.vehicleId},state.tokens.staff)).length>0);
  });
  await test('VEHICLES.LIST_MINE','vehicles.listMine',async()=>{
   const rows=ok(await request('vehicles.listMine',{limit:100},state.tokens.owner));
   assert.ok(rows.some(x=>x.vehicleId===state.approved.vehicleId));
  });
  await test('VEHICLES.LIST_MINE.FORBIDDEN','vehicles.listMine',async()=>
   denied(await request('vehicles.listMine',{limit:100},state.tokens.staff),'FORBIDDEN'));
  await test('VEHICLES.LIST','vehicles.list',async()=>{
   const rows=ok(await request('vehicles.list',{limit:100},adminToken));
   assert.ok(rows.some(x=>x.vehicleId===state.approved.vehicleId));
  });
  await test('VEHICLES.LIST.FORBIDDEN','vehicles.list',async()=>
   denied(await request('vehicles.list',{limit:100},state.tokens.staff),'FORBIDDEN'));
  await test('CHANGES.SUBMIT','changes.submit',async()=>{
   state.change=ok(await request('changes.submit',{vehicleId:state.approved.vehicleId,color:'ORANGE'},state.tokens.owner));
   assert.ok(state.change.requestId);
  });
  await test('CHANGES.LIST_MINE','changes.listMine',async()=>{
   const rows=ok(await request('changes.listMine',{limit:100},state.tokens.owner));
   assert.ok(rows.some(x=>x.requestId===state.change.requestId));
  });
  await test('CHANGES.LIST_PENDING','changes.listPending',async()=>{
   const rows=ok(await request('changes.listPending',{limit:100},state.tokens.reg));
   assert.ok(rows.some(x=>x.requestId===state.change.requestId));
  });
  await test('CHANGES.REVIEW','changes.review',async()=>{
   assert.equal(ok(await request('changes.review',{requestId:state.change.requestId,decision:'APPROVE'},state.tokens.reg)).status,'APPROVE');
  });
  await test('QR.RESOLVE','qr.resolve',async()=>{
   assert.equal(ok(await request('qr.resolve',{token:state.approved.qrToken},state.tokens.staff)).vehicleId,state.approved.vehicleId);
  });
  await test('QR.REVOKE','qr.revoke',async()=>{
   assert.equal(ok(await request('qr.revoke',{vehicleId:state.approved.vehicleId},state.tokens.reg)).revoked,true);
  });
  await test('QR.ISSUE','qr.issue',async()=>{state.qr=ok(await request('qr.issue',{vehicleId:state.approved.vehicleId},state.tokens.reg));assert.ok(state.qr.token);});
  await test('QR.REPLACE','qr.replace',async()=>{state.qr=ok(await request('qr.replace',{vehicleId:state.approved.vehicleId},state.tokens.reg));assert.ok(state.qr.token);});
  await test('PHOTOS.REPLACE','photos.replace',async()=>{
   assert.equal(ok(await request('photos.replace',{vehicleId:state.approved.vehicleId,slot:'FRONT',base64Image:png,mimeType:'image/png'},state.tokens.reg)).replaced,true);
  });
  await test('AUDIT.QUERY','audit.query',async()=>{
   assert.ok(ok(await request('audit.query',{vehicleId:state.approved.vehicleId,limit:100},adminToken)).length>0);
  });
  await test('AUDIT.EXPORT','audit.export',async()=>{
   assert.equal(ok(await request('audit.export',{vehicleId:state.approved.vehicleId,limit:100},adminToken)).format,'JSON');
  });
  await test('VEHICLES.CANCEL','vehicles.cancel',async()=>{
   assert.equal(ok(await request('vehicles.cancel',{vehicleId:state.approved.vehicleId},state.tokens.reg)).status,'INACTIVE');state.cancelled=true;
  });
  // Cold index builds can stretch wall-clock time past the idle timeout between actor
  // login and this block; refresh the worker session so idle expiry cannot mask the case.
  if(state.users.worker)state.tokens.worker=await login(state.users.worker.username,actorActive);
  await test('RETENTION.LIST_DUE','retention.listDue',async()=>{
   assert.ok(Array.isArray(ok(await request('retention.listDue',{limit:100},adminToken))));
  });
  await test('RETENTION.LIST_EXECUTABLE','retention.listExecutable',async()=>{
   assert.ok(Array.isArray(ok(await request('retention.listExecutable',{limit:100},state.tokens.worker))));
  });
  await test('RETENTION.LIST_EXECUTABLE.FORBIDDEN','retention.listExecutable',async()=>
   denied(await request('retention.listExecutable',{limit:100},state.tokens.staff),'FORBIDDEN'));
  await test('RETENTION.JOB_STATUS','retention.jobStatus',async()=>{
   assert.equal(ok(await request('retention.jobStatus',{jobId:'no-such-job-'+tag},adminToken)),null);
  });
  await test('RETENTION.APPROVE.NEGATIVE','retention.approve',async()=>
   denied(await request('retention.approve',{jobId:'no-such-job-'+tag},adminToken),'RETENTION_NOT_APPROVABLE'));
  await test('RETENTION.EXECUTE.DISABLED','retention.execute',async()=>
   denied(await request('retention.execute',{jobId:'no-such-job-'+tag},state.tokens.worker),'RETENTION_EXECUTION_DISABLED'));
 }

 async function performRestore(){
  if(state.approved?.vehicleId&&!state.cancelled&&state.tokens.reg)await cleanup('VEHICLE_CANCEL',async()=>
   ok(await request('vehicles.cancel',{vehicleId:state.approved.vehicleId},state.tokens.reg)));
  if(adminToken&&state.campaign?.campaignId)await cleanup('CAMPAIGN_REVOKE',async()=>ok(await request('campaigns.revoke',{campaignId:state.campaign.campaignId},adminToken)));
  if(adminToken&&state.org?.organizationId)await cleanup('ORGANIZATION_DISABLE',async()=>ok(await request('organizations.disable',{organizationId:state.org.organizationId},adminToken)));
  if(adminToken)for(const [kind,user] of Object.entries(state.users))await cleanup('USER_SUSPEND_'+kind,async()=>
   ok(await request('users.suspend',{userId:user.userId},adminToken)));
  if(adminToken)await cleanup('AUTOMATION_ADMIN_LOGOUT',async()=>ok(await request('auth.logout',{},adminToken)));
 }
 let restorePromise=null;
 function restore(){
  if(!restorePromise)restorePromise=performRestore();
  return restorePromise;
 }
 return {state,covered,run,restore,login};
}

// ---- Live GAS HTTP transport (CLI) ----
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const isCli=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isCli){
 const url=process.env.P6VC_GAS_EXEC_URL;
 const username=process.env.P6VC_TEST_USERNAME;
 const testPassword=process.env.P6VC_TEST_PASSWORD;
 // GAS Web App, or the project's Cloud Run API (VC-ADR-033) — same v1 envelope.
 assert.match(url||'',/^(https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec|https:\/\/p6vc-api-[0-9]+\.asia-southeast3\.run\.app)$/);
 assert.ok(username&&testPassword,'P6VC test credentials are required');
 assert.equal(process.env.P6VC_ALLOW_OWNER_DEV_WRITES,'RUN_SYNTHETIC_OWNER_DEV');

 const report={status:'RUNNING',environment:/run\.app$/.test(url)?'OWNER_SELECTED_DEVELOPMENT_CLOUD_RUN':'OWNER_SELECTED_DEVELOPMENT_GAS',target:url,
  startedAt:new Date().toISOString(),tests:[],coverage:[],cleanup:[],secretsExposed:false};
 const tag=Date.now().toString(36);
 let activeRequestController=null,interruptedBy=null;

 function persistReport(){
  report.coverage=[...cases.covered].sort();
  fs.mkdirSync('test-results',{recursive:true});
  fs.writeFileSync('test-results/p6vc-live-owner-dev-regression.json',JSON.stringify(report,null,2)+'\n');
 }
 const cases=createRegressionCases({request:httpRequest,username,testPassword,tag,report,persist:persistReport});
 persistReport();

 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{
  interruptedBy=signal;
  report.interruptedBy=signal;
  report.status='INTERRUPTING';
  persistReport();
  if(activeRequestController)activeRequestController.abort();
 });

 async function httpRequest(operation,payload={},token=null){
  const split=operation.indexOf('.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),40000);
  activeRequestController=controller;
  let response;
  try{
   response=await fetch(url,{method:'POST',redirect:'follow',signal:controller.signal,
    headers:{'content-type':'text/plain;charset=utf-8','accept':'application/json'},
    body:JSON.stringify({apiVersion:'v1',group:operation.slice(0,split),action:operation.slice(split+1),payload,
     ...(token?{sessionToken:token}:{}),requestId:'ownerDev'+tag})});
  }catch(error){
   // Record WHY the transport failed (e.g. ECONNRESET, UND_ERR_SOCKET) instead of "fetch failed".
   if(error?.name==='AbortError')throw Error('CLIENT_TIMEOUT_40S');
   throw Error('NETWORK_'+String(error?.cause?.code||error?.cause?.name||'UNKNOWN').slice(0,40));
  }finally{
   clearTimeout(timer);
   if(activeRequestController===controller)activeRequestController=null;
  }
  let body;try{body=await response.json();}catch{throw Error('NON_JSON_RESPONSE');}
  if(response.status!==200)throw Error('HTTP_'+response.status);
  if(!body||typeof body.ok!=='boolean'||!Object.hasOwn(body,'data')||!Object.hasOwn(body,'error'))
   throw Error('INVALID_API_ENVELOPE');
  return body;
 }

 try{await cases.run();}
 catch(error){report.fatal=String(error?.message||error).slice(0,120);}
 finally{
  await cases.restore();
  report.coverage=[...cases.covered].sort();
  report.missingOperations=[...expectedOperations].filter(x=>!cases.covered.has(x)).sort();
  report.finishedAt=new Date().toISOString();
  report.passed=report.tests.filter(x=>x.status==='PASS').length;
  report.failed=report.tests.filter(x=>x.status==='FAIL').length;
  report.status=interruptedBy?'INTERRUPTED':
   (!report.fatal&&!report.failed&&!report.missingOperations.length&&report.cleanup.every(x=>x.status==='PASS')?'PASS':'FAIL');
  persistReport();
  console.log('FINAL '+JSON.stringify({status:report.status,tests:report.tests.length,passed:report.passed,failed:report.failed,
   covered:report.coverage.length,missing:report.missingOperations.length,cleanupFailed:report.cleanup.filter(x=>x.status==='FAIL').length}));
  if(report.status!=='PASS')process.exitCode=interruptedBy?130:1;
 }
}