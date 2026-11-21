// Owner-authorized A2 approval E2E against the live DEV backend via the Cloudflare Worker gateway.
// Approves pending synthetic registrations, verifies the original synthetic batch (lookup + fresh QR
// resolve), and runs review/photo negatives. Creates synthetic approvals only; never touches real data.
// Credentials and tokens are env/memory-only; the report is sanitized (no passwords, session tokens,
// raw QR tokens, or personal data). Requires the explicit owner-dev write guard, like the regression runner.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';

const endpoint=process.env.P6VC_WORKER_FRONTEND_URL;
const origin=process.env.P6VC_FRONTEND_ORIGIN||'https://idev006.github.io';
const user=process.env.P6VC_ADMIN_USER;
const password=process.env.P6VC_ADMIN_PASS;
const batchPrefix=process.env.P6VC_BATCH_PREFIX||'ฑฆ';
const batchExpected=Number(process.env.P6VC_BATCH_EXPECTED||'10');
assert.match(endpoint||'',/^https:\/\/[a-z0-9.-]+\.workers\.dev\/api\/frontend$/,'P6VC_WORKER_FRONTEND_URL must be the Worker /api/frontend endpoint');
assert.ok(user&&password,'P6VC_ADMIN_USER and P6VC_ADMIN_PASS are required (env only, never persisted)');
assert.equal(process.env.P6VC_ALLOW_OWNER_DEV_WRITES,'RUN_SYNTHETIC_OWNER_DEV','owner-dev synthetic write guard is required');

let sessionToken=null;
async function call(operation,payload={},{auth=true}={}){
 const [group,...rest]=operation.split('.');
 const body={apiVersion:'v1',group,action:rest.join('.'),payload,requestId:randomUUID(),...(auth&&sessionToken?{sessionToken}:{})};
 const res=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',origin,accept:'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
 const j=await res.json();
 if(j.error&&!('ok'in j))throw new Error('WORKER_'+j.error);
 return j;
}
const ok=(j,label)=>{if(!j.ok)throw new Error(label+' -> '+JSON.stringify(j.error));return j.data;};
const report={startedAt:new Date().toISOString(),endpoint,origin,steps:[],approved:[],batchVerified:[],negatives:[],summary:{},secretsExposed:false};
const step=(name,detail)=>{report.steps.push({name,at:new Date().toISOString(),...detail});console.log(name,JSON.stringify(detail));};
const isBatch=plate=>(plate||'').startsWith(batchPrefix);
function persist(){fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/p6vc-live-approval-e2e.json',JSON.stringify(report,null,2)+'\n');}

try{
 const login=ok(await call('auth.login',{username:user,password},{auth:false}),'login');sessionToken=login.sessionToken;
 const health=ok(await call('system.health',{},{auth:false}),'health');
 step('LOGIN_HEALTH',{mustChangePassword:login.mustChangePassword,backendVersion:health.backendVersion});

 // Capture pre-approved original-batch rows BEFORE new writes push them out of the audit window.
 const auditRaw=ok(await call('audit.query',{limit:100}),'audit');
 const auditRows=Array.isArray(auditRaw)?auditRaw:(auditRaw.items||[]);
 const preBatch=[];const preSeen=new Set();
 for(const a of auditRows.filter(x=>x.action==='REGISTRATION_APPROVED')){
  const eid=a.entityId||a.entity_id;if(!eid||preSeen.has(eid))continue;preSeen.add(eid);
  const d=ok(await call('registrations.detail',{requestId:eid}),'detailPre');const app=d.application;
  if(isBatch(app.plate_normalized))preBatch.push({plate:app.plate_normalized,province:String(app.province_code)});
 }
 step('PRE_APPROVED_BATCH',{count:preBatch.length,plates:preBatch.map(x=>x.plate)});

 const pending=ok(await call('registrations.listPending',{page:1,pageSize:100}),'listPending');
 const items=pending.items||pending.registrations||[];
 step('LIST_PENDING',{total:pending.total??items.length,count:items.length});

 for(const [i,item]of items.entries()){
  const d=ok(await call('registrations.detail',{requestId:item.requestId}),'detail');const app=d.application;
  const front=app.photos.find(p=>p.slot==='FRONT');
  const photo=ok(await call('registrations.photo',{requestId:item.requestId,photoId:front.photoId}),'photo');
  if(photo.photoId!==front.photoId||photo.slot!=='FRONT'||!photo.base64Image)throw new Error('PHOTO_CONTRACT');
  const rev=ok(await call('registrations.review',{requestId:item.requestId,decision:'APPROVE',platePhotoVerified:true}),'review');
  if(rev.status!=='APPROVED'||!rev.qrToken)throw new Error('REVIEW_CONTRACT');
  const lk=ok(await call('vehicles.lookup',{plate:app.plate_normalized,province:app.province_code}),'lookup');
  if(!lk||lk.vehicleId!==rev.vehicleId)throw new Error('LOOKUP_MISMATCH:'+app.plate_normalized);
  const qr=ok(await call('qr.resolve',{token:rev.qrToken}),'qr.resolve');
  if(!qr||qr.vehicleId!==rev.vehicleId)throw new Error('QR_MISMATCH');
  report.approved.push({n:i+1,plate:app.plate_normalized,province:String(app.province_code),vehicleId:rev.vehicleId,status:rev.status,
   photoRead:{slot:photo.slot,mimeType:photo.mimeType,base64Length:photo.base64Image.length},
   lookup:{contacts:Array.isArray(lk.contacts)?lk.contacts.length:0,photos:Array.isArray(lk.photos)?lk.photos.length:0},qrResolve:'MATCH'});
  console.log('APPROVED '+(i+1)+'/'+items.length,JSON.stringify(report.approved.at(-1)));
 }

 // Verify the full original batch (pre-approved + newly approved), each lookup + fresh QR resolve.
 const batch=[...preBatch,...report.approved.map(x=>({plate:x.plate,province:x.province}))];
 const seen=new Set();
 for(const b of batch){
  if(seen.has(b.plate))continue;seen.add(b.plate);
  const lk=ok(await call('vehicles.lookup',{plate:b.plate,province:b.province}),'lookupBatch');
  const found=!!(lk&&lk.vehicleId);let qrMatch='N/A';
  if(found){const rep=ok(await call('qr.replace',{vehicleId:lk.vehicleId}),'qr.replace');const res=ok(await call('qr.resolve',{token:rep.token}),'qr.resolveBatch');qrMatch=res&&res.vehicleId===lk.vehicleId?'MATCH':'MISMATCH';}
  report.batchVerified.push({plate:b.plate,province:b.province,lookupFound:found,qrResolve:qrMatch});
 }
 step('BATCH_VERIFY',{count:report.batchVerified.length,rows:report.batchVerified});

 // Negatives: re-review an approved request; foreign-snapshot photo.
 if(items.length>=1){
  const replay=await call('registrations.review',{requestId:items[0].requestId,decision:'APPROVE',platePhotoVerified:true});
  report.negatives.push({case:'REVIEW_ALREADY_REVIEWED',expected:'INVALID_REQUEST_STATE',actual:replay.error?.code,pass:replay.error?.code==='INVALID_REQUEST_STATE'});
 }
 if(items.length>=2){
  const d2=ok(await call('registrations.detail',{requestId:items[1].requestId}),'detail2');
  const foreign=await call('registrations.photo',{requestId:items[0].requestId,photoId:d2.application.photos[0].photoId});
  report.negatives.push({case:'PHOTO_FOREIGN_SNAPSHOT',expected:'PHOTO_NOT_FOUND',actual:foreign.error?.code,pass:foreign.error?.code==='PHOTO_NOT_FOUND'});
 }
 console.log('NEGATIVES',JSON.stringify(report.negatives));

 const batchOk=report.batchVerified.length===batchExpected&&report.batchVerified.every(x=>x.lookupFound&&x.qrResolve==='MATCH');
 report.summary={newlyApproved:report.approved.length,pendingCount:items.length,preApproved:preBatch.length,batchExpected,batchVerified:report.batchVerified.length,batchAllLookupAndQr:batchOk,negativesPass:report.negatives.every(x=>x.pass)};
 report.finishedAt=new Date().toISOString();
 persist();
 const pass=batchOk&&report.negatives.every(x=>x.pass)&&report.approved.length===items.length;
 console.log(JSON.stringify(report.summary));
 console.log(pass?'A2_APPROVAL_E2E_PASS_'+batchExpected+'_OF_'+batchExpected:'A2_APPROVAL_E2E_INCOMPLETE');
 process.exitCode=pass?0:1;
}finally{
 if(sessionToken){try{const out=await call('auth.logout',{});report.steps.push({name:'LOGOUT',revoked:out.ok===true});console.log('LOGOUT',out.ok===true);}catch(e){console.log('LOGOUT_FAILED',String(e.message).slice(0,60));}sessionToken=null;}
 report.finishedAt=report.finishedAt||new Date().toISOString();
 persist();
}