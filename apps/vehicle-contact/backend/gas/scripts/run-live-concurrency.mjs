// G7 (VC-ADR-024 Slice C) — LIVE concurrency + idempotency proof for the W1 one-commit writes.
// Fires truly concurrent API calls at the live GAS deployment, then proves the outcome with an
// INDEPENDENT Firestore read-back (API OK ≠ data proof). Synthetic DEV only; exact gates; a
// sanitized report (ids/counters/codes — no tokens, credentials or PII) to test-results/.
//   C1 IDEMPOTENT_SUBMIT_RACE   N identical submits, same idempotency key → exactly ONE request,
//                               one idempotency row, quota +1, every OK response = same requestId.
//   C2 CONCURRENT_APPROVE_RACE  N concurrent approvals of that request → exactly ONE vehicle,
//                               ONE active QR, 5 photos, 1 contact, ONE APPLIED review journal;
//                               every OK response carries the same vehicle/QR.
//   C3 SAME_PLATE_DIFFERENT_KEYS (observational) two concurrent submits, same plate, different
//                               keys → records how many pending requests land (known W1 limit).
// Run from backend/gas (gates required):
//   P6VC_ALLOW_OWNER_DEV_WRITES=RUN_SYNTHETIC_OWNER_DEV P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE \
//     node scripts/run-live-concurrency.mjs
import './load-env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,createSign} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const WRITE_GATE='RUN_SYNTHETIC_OWNER_DEV';
export const PROBE_GATE='RUN_SYNTHETIC_FIRESTORE_PROBE';
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/C7sAAAAASUVORK5CYII=';
const SLOTS=['FRONT','REAR','LEFT','RIGHT','FRONT_ANGLE'];
const sha256=v=>createHash('sha256').update(String(v),'utf8').digest('hex');

// ---- Pure evaluators (unit-tested offline) ----
export function evaluateSubmitRace(responses,data){
  const ok=responses.filter(r=>r&&r.ok),ids=new Set(ok.map(r=>r.data.requestId));
  const errors=responses.filter(r=>!r||!r.ok).map(r=>r&&r.error?r.error.code:'NO_RESPONSE');
  const checks={atLeastOneOk:ok.length>=1,allOkSameRequest:ids.size===1,noUnexpectedErrors:errors.length===0,
    oneRequestRow:data.requests===1,oneIdempotencyRow:data.idempotency===1,quotaPlusOne:data.submittedCount===1,
    fivePhotosClaimed:data.photosClaimed===5};
  return {status:Object.values(checks).every(Boolean)?'PASS':'FAIL',okCount:ok.length,errors,checks};
}
export function evaluateApproveRace(responses,data){
  const ok=responses.filter(r=>r&&r.ok);
  const errors=responses.filter(r=>!r||!r.ok).map(r=>r&&r.error?r.error.code:'NO_RESPONSE');
  const same=k=>new Set(ok.map(r=>r.data[k])).size===1;
  const checks={atLeastOneOk:ok.length>=1,okResponsesConsistent:same('vehicleId')&&same('qrId')&&same('qrToken'),
    onlyStateConflictErrors:errors.every(c=>c==='INVALID_REQUEST_STATE'),
    oneVehicle:data.vehicles===1,oneActiveQr:data.activeQr===1,fivePhotos:data.photos===5,oneContact:data.contacts===1,
    oneAppliedJournal:data.appliedJournals===1};
  return {status:Object.values(checks).every(Boolean)?'PASS':'FAIL',okCount:ok.length,errors,checks};
}

// ---- Firestore REST read-back (independent of the API) ----
export async function firestoreReader(env){
  const key=JSON.parse(fs.readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS,'utf8'));
  const project=env.FIRESTORE_PROJECT_ID||key.project_id,db=env.FIRESTORE_DATABASE_ID||'(default)';
  const base=`https://firestore.googleapis.com/v1/projects/${project}/databases/${db}/documents`;
  const b64=s=>Buffer.from(s).toString('base64url'),now=Math.floor(Date.now()/1000);
  const unsigned=b64(JSON.stringify({alg:'RS256',typ:'JWT'}))+'.'+b64(JSON.stringify({iss:key.client_email,
    scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}));
  const jwt=unsigned+'.'+createSign('RSA-SHA256').update(unsigned).sign(key.private_key).toString('base64url');
  const tr=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt})});
  const token=(await tr.json()).access_token;
  const val=v=>'stringValue' in v?v.stringValue:'integerValue' in v?Number(v.integerValue):'booleanValue' in v?v.booleanValue:'doubleValue' in v?v.doubleValue:null;
  return async function where(coll,field,value){
    const r=await fetch(base+':runQuery',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({structuredQuery:{from:[{collectionId:coll}],where:{fieldFilter:{field:{fieldPath:field},op:'EQUAL',value:{stringValue:value}}}}})});
    const rows=await r.json();
    if(!r.ok)throw new Error('FIRESTORE_'+r.status);
    return rows.filter(x=>x.document).map(x=>Object.fromEntries(Object.entries(x.document.fields||{}).map(([k,v])=>[k,val(v)])));
  };
}

export async function runConcurrency({env=process.env,fetchImpl=fetch,parallel=4,reportDir='test-results',persist=true}={}){
  const report={status:'RUNNING',suite:'G7_LIVE_CONCURRENCY',startedAt:new Date().toISOString(),scenarios:[],cleanup:[],secretsExposed:false};
  const save=()=>{if(!persist)return;fs.mkdirSync(reportDir,{recursive:true});fs.writeFileSync(path.join(reportDir,'p6vc-live-concurrency.json'),JSON.stringify(report,null,2)+'\n');};
  const blocked=reason=>{report.status='BLOCKED';report.reason=reason;save();return report;};
  if(env.P6VC_ALLOW_OWNER_DEV_WRITES!==WRITE_GATE)return blocked('MISSING_WRITE_GATE');
  if(env.P6VC_ALLOW_FIRESTORE_DEV_PROBE!==PROBE_GATE||!env.GOOGLE_APPLICATION_CREDENTIALS)return blocked('MISSING_FIRESTORE_PROBE_GATE');
  const url=env.P6VC_GAS_EXEC_URL;
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url||''))return blocked('INVALID_EXEC_URL');
  if(!env.P6VC_ADMIN_USER||!env.P6VC_ADMIN_PASS)return blocked('MISSING_ADMIN_CREDENTIALS');
  const call=async(op,payload={},sessionToken)=>{
    const [group,...a]=op.split('.');
    try{const r=await fetchImpl(url,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({apiVersion:'v1',group,action:a.join('.'),payload,requestId:'g7'+Math.random().toString(36).slice(2,12),...(sessionToken?{sessionToken}:{})})});
      return JSON.parse(await r.text());}
    catch(e){return {ok:false,error:{code:'NO_RESPONSE'}};}
  };
  const must=async(op,payload,t)=>{const r=await call(op,payload,t);if(!r.ok)throw new Error(op+':'+(r.error&&r.error.code));return r.data;};
  const tag=Date.now().toString(36).slice(-6),where=await firestoreReader(env);
  let admin=null,org=null,camp=null,vehicleId=null;const pendingToReject=[];
  try{
    admin=(await must('auth.login',{username:env.P6VC_ADMIN_USER,password:env.P6VC_ADMIN_PASS})).sessionToken;
    org=await must('organizations.create',{name:'P6VC Concurrency '+tag,type:'EXTERNAL'},admin);
    const t=Date.now();
    camp=await must('campaigns.create',{startsAt:new Date(t-60000).toISOString(),endsAt:new Date(t+3600000).toISOString(),maxSubmissions:20},admin);
    const stage=async()=>{const photos=[];for(const slot of SLOTS)photos.push({slot,photoId:(await must('photos.upload',{campaignToken:camp.campaignToken,slot,base64Image:PNG,mimeType:'image/png'})).photoId});return photos;};
    const payload=(plate,photos,key)=>({campaignToken:camp.campaignToken,plate,province:'TH-10',plateType:'PRIVATE',vehicleType:'SEDAN',
      brand:'SYNTHETIC',model:'AUTOMATED',color:'WHITE',organizationId:org.organizationId,relationship:'REGISTERED_CONTACT',
      contactName:'Synthetic Concurrency Contact',contactPhone:'+66810000003',photos,idempotencyKey:key});

    // C1 — identical submits, same idempotency key, fired concurrently.
    const plate1='TST'+String(Date.now()).slice(-8),photos1=await stage(),key1='g7-'+tag+'-c1';
    const c1=await Promise.all(Array.from({length:parallel},()=>call('registrations.submit',payload(plate1,photos1,key1))));
    const idemKey=sha256('registration:'+camp.campaignId+':'+key1);
    const reqRows=await where('vc_registration_requests','idempotency_key',idemKey);
    const campRow=(await where('vc_campaigns','campaign_id',camp.campaignId))[0]||{};
    const staged=[];for(const p of photos1)staged.push(...await where('vc_photo_staging','photo_id',p.photoId));
    const c1eval=evaluateSubmitRace(c1,{requests:reqRows.length,idempotency:(await where('vc_idempotency','key',idemKey)).length,
      submittedCount:Number(campRow.submitted_count),photosClaimed:staged.filter(s=>s.status==='CLAIMED').length});
    report.scenarios.push({id:'C1_IDEMPOTENT_SUBMIT_RACE',parallel,...c1eval});save();
    const requestId=(c1.find(r=>r&&r.ok)||{data:{}}).data.requestId;

    // C2 — concurrent approvals of the same request.
    if(requestId){
      const c2=await Promise.all(Array.from({length:Math.max(2,parallel-1)},()=>call('registrations.review',{requestId,decision:'APPROVE',platePhotoVerified:true},admin)));
      const okR=c2.find(r=>r&&r.ok);vehicleId=okR?okR.data.vehicleId:null;
      const vid=vehicleId||reqRows[0]?.vehicle_id||'none';
      const journals=(await where('vc_operation_journal','entity_id',requestId)).filter(j=>j.operation==='registrations.review'&&j.status==='APPLIED');
      const c2eval=evaluateApproveRace(c2,{vehicles:(await where('vc_vehicles','vehicle_id',vid)).length,
        activeQr:(await where('vc_qr_tokens','vehicle_id',vid)).filter(q=>q.status==='ACTIVE').length,
        photos:(await where('vc_vehicle_photos','vehicle_id',vid)).filter(p=>p.status==='ACTIVE').length,
        contacts:(await where('vc_vehicle_contacts','vehicle_id',vid)).filter(c=>c.status==='ACTIVE').length,
        appliedJournals:journals.length});
      report.scenarios.push({id:'C2_CONCURRENT_APPROVE_RACE',parallel:c2.length,...c2eval});save();
    } else report.scenarios.push({id:'C2_CONCURRENT_APPROVE_RACE',status:'BLOCKED',reason:'NO_REQUEST_FROM_C1'});

    // C3 — observational: same plate, different keys, concurrently.
    const plate3='TST'+String(Date.now()+7).slice(-8),[pa,pb]=[await stage(),await stage()];
    const c3=await Promise.all([call('registrations.submit',payload(plate3,pa,'g7-'+tag+'-c3a')),call('registrations.submit',payload(plate3,pb,'g7-'+tag+'-c3b'))]);
    const okIds=c3.filter(r=>r&&r.ok).map(r=>r.data.requestId);pendingToReject.push(...okIds);
    report.scenarios.push({id:'C3_SAME_PLATE_DIFFERENT_KEYS',status:'OBSERVED',pendingCreated:okIds.length,
      errors:c3.filter(r=>!r.ok).map(r=>r.error&&r.error.code),note:okIds.length>1?'KNOWN_W1_LIMITATION: duplicate pending for one plate under exact concurrency (reviewer sees both; approval of the 2nd is blocked by DUPLICATE_VEHICLE)':'duplicate rejected'});
    save();
    report.status=report.scenarios.filter(s=>s.status!=='OBSERVED').every(s=>s.status==='PASS')?'PASS':'FAIL';
  }catch(e){report.status='FAIL';report.fatal=String(e&&e.message||e).slice(0,120);}
  finally{
    const clean=async(id,fn)=>{try{await fn();report.cleanup.push({id,status:'PASS'});}catch(e){report.cleanup.push({id,status:'FAIL',reason:String(e.message).slice(0,80)});}};
    if(admin){
      for(const r of pendingToReject)await clean('REJECT_'+r.slice(0,8),()=>must('registrations.review',{requestId:r,decision:'REJECT'},admin));
      if(vehicleId)await clean('CANCEL_VEHICLE',()=>must('vehicles.cancel',{vehicleId},admin));
      if(camp)await clean('REVOKE_CAMPAIGN',()=>must('campaigns.revoke',{campaignId:camp.campaignId},admin));
      if(org)await clean('DISABLE_ORG',()=>must('organizations.disable',{organizationId:org.organizationId},admin));
      await clean('ADMIN_LOGOUT',()=>must('auth.logout',{},admin));
    }
    report.finishedAt=new Date().toISOString();
    if(report.status==='PASS'&&report.cleanup.some(c=>c.status==='FAIL'))report.status='CLEANUP_FAIL';
    save();
  }
  return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const r=await runConcurrency({parallel:Number(process.env.P6VC_G7_PARALLEL||4)});
  console.log('G7 '+JSON.stringify({status:r.status,scenarios:r.scenarios.map(s=>({id:s.id,status:s.status,ok:s.okCount,errors:s.errors,checks:s.checks&&Object.entries(s.checks).filter(([,v])=>!v).map(([k])=>k)})),
    cleanup:r.cleanup.filter(c=>c.status!=='PASS'),fatal:r.fatal||null,report:'test-results/p6vc-live-concurrency.json'}));
  process.exitCode=r.status==='PASS'?0:1;
}
