// P2 proof (UI E2E finding: intake ≈46 s with sequential photo uploads). Calls the SAME live API the
// frontend uses and measures 5 uploads sequential vs parallel, then submits the parallel set and
// verifies the SSOT (Firestore rows + staging) before cleaning up (reject + revoke campaign).
// Synthetic DEV only. Gates and run (from backend/gas):
//   P6VC_ALLOW_OWNER_DEV_WRITES=RUN_SYNTHETIC_OWNER_DEV P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE \
//     node scripts/measure-intake-upload-timing.mjs
import './load-env.mjs';
import {firestoreReader,WRITE_GATE,PROBE_GATE} from './run-live-concurrency.mjs';

const env=process.env;
if(env.P6VC_ALLOW_OWNER_DEV_WRITES!==WRITE_GATE||env.P6VC_ALLOW_FIRESTORE_DEV_PROBE!==PROBE_GATE){console.log('BLOCKED: gates');process.exit(2);}
const url=env.P6VC_GAS_EXEC_URL;
const SLOTS=['FRONT','REAR','LEFT','RIGHT','FRONT_ANGLE'];
// ~12 KB JPEG-sized payload like the UI test (real bytes matter for upload time).
import {randomBytes} from 'node:crypto';
const img=Buffer.concat([Buffer.from([0xFF,0xD8,0xFF,0xE0]),randomBytes(12000),Buffer.from([0xFF,0xD9])]).toString('base64');
const call=async(op,payload={},sessionToken)=>{const [group,...a]=op.split('.');
  const r=await fetch(url,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify({apiVersion:'v1',group,action:a.join('.'),payload,requestId:'tm'+Math.random().toString(36).slice(2,10),...(sessionToken?{sessionToken}:{})})});
  const j=JSON.parse(await r.text());if(!j.ok)throw new Error(op+':'+j.error?.code);return j.data;};
const time=async fn=>{const t=performance.now();const v=await fn();return [Math.round(performance.now()-t),v];};

const where=await firestoreReader(env);
const admin=(await call('auth.login',{username:env.P6VC_ADMIN_USER,password:env.P6VC_ADMIN_PASS})).sessionToken;
const now=Date.now();
const camp=await call('campaigns.create',{startsAt:new Date(now-60000).toISOString(),endsAt:new Date(now+3600000).toISOString(),maxSubmissions:3},admin);
const upload=slot=>call('photos.upload',{campaignToken:camp.campaignToken,slot,base64Image:img,mimeType:'image/jpeg'});
const report={};
try{
  const [seqMs]=await time(async()=>{for(const s of SLOTS)await upload(s);});
  const [parMs,par]=await time(()=>Promise.all(SLOTS.map(upload)));
  report.uploadsSequentialMs=seqMs;report.uploadsParallelMs=parMs;
  const org=(await call('organizations.list',{},admin));const orgId=(org.items||org)[0].organizationId;
  const plate='ทส '+String(Date.now()).slice(-4);
  const [submitMs,sub]=await time(()=>call('registrations.submit',{campaignToken:camp.campaignToken,plate,province:'65',plateType:'STANDARD',vehicleType:'RY01',
    brand:'TOYOTA',model:'Timing',color:'WHITE',organizationId:orgId,relationship:'OWNER',contactName:'Synthetic Timing',contactPhone:'+66810000098',
    photos:SLOTS.map((slot,i)=>({slot,photoId:par[i].photoId})),idempotencyKey:'timing-'+Date.now()}));
  report.submitMs=submitMs;report.intakeTotalParallelMs=parMs+submitMs;
  const req=(await where('vc_registration_requests','request_id',sub.requestId))[0];
  const staged=[];for(const p of par)staged.push(...await where('vc_photo_staging','photo_id',p.photoId));
  report.ssot={request:req?.status,claimed:staged.filter(s=>s.status==='CLAIMED').length,mime:JSON.parse(req.application_json).photos.map(p=>p.mimeType)};
  await call('registrations.review',{requestId:sub.requestId,decision:'REJECT'},admin);
  report.cleanupRequest=(await where('vc_registration_requests','request_id',sub.requestId))[0]?.status;
}finally{
  await call('campaigns.revoke',{campaignId:camp.campaignId},admin).catch(e=>{report.revokeError=String(e.message);});
  report.campaignAfter=(await where('vc_campaigns','campaign_id',camp.campaignId))[0]?.status;
  await call('auth.logout',{},admin).catch(()=>{});
  console.log('TIMING '+JSON.stringify(report));
}
