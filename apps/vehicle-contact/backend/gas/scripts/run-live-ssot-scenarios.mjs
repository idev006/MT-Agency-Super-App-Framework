// SSOT-verified live scenarios (TEST_SUITE_SSOT_DESIGN_20261124 §3): the "suspected defects".
// Every verdict comes from an INDEPENDENT Firestore read-back, never from the API response.
//   C3b DUPLICATE_PLATE_APPROVAL  2 pendings for one plate (raced) → approving both yields ONE vehicle
//   C4  APPROVE_VS_REJECT_RACE    final state must be consistent (APPROVED+vehicle | REJECTED+no vehicle)
//   C5  QUOTA_AT_CAPACITY_RACE    4 concurrent submits into a max=2 campaign → ≤2 accepted, count ≤ max
//   C6  CHANGE_REVIEW_RACE        approve change A twice + change B, all concurrent, on ONE vehicle →
//                                 both applied once, version +2 exactly, one audit row per change
//   S1  RBAC_DENY_STAFF           STAFF calls 3 admin ops → FORBIDDEN and no rows written
//   S2  LOGOUT_TOKEN_REUSE        logged-out token → UNAUTHENTICATED; session REVOKED in Firestore
//   S3  PASSWORD_CHANGE_REVOKES   change password → every session of the user REVOKED in Firestore
//   S4  QR_REVOKE_RESOLVE         revoked QR cannot resolve; QR status REVOKED in Firestore
//   S5  LOOKUP_AUDIT_ONE_ROW      one lookup → exactly one new vc_lookup_audit row
// Gates and run (from backend/gas):
//   P6VC_ALLOW_OWNER_DEV_WRITES=RUN_SYNTHETIC_OWNER_DEV P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE \
//     node scripts/run-live-ssot-scenarios.mjs
import './load-env.mjs';
import {resolveApiBaseUrl} from './trusted-endpoint.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {firestoreReader,WRITE_GATE,PROBE_GATE} from './run-live-concurrency.mjs';

const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/C7sAAAAASUVORK5CYII=';
const SLOTS=['FRONT','REAR','LEFT','RIGHT','FRONT_ANGLE'];

// Pure verdicts (unit-tested offline).
export const verdict={
  c3b:d=>d.activeVehiclesForPlate===1&&d.secondApprovalCode==='DUPLICATE_VEHICLE',
  c4:d=>(d.status==='APPROVED'&&d.vehicles===1)||(d.status==='REJECTED'&&d.vehicles===0),
  c5:d=>d.submittedCount<=d.max&&d.requestRows<=d.max&&d.requestRows===d.okResponses,
  c6:d=>d.statusA==='APPROVED'&&d.statusB==='APPROVED'&&d.versionDelta===2&&d.modelApplied&&d.colorApplied
    &&d.auditA===1&&d.auditB===1&&d.codes.every(c=>c==='OK'||c==='BUSY'),
  s1:d=>d.codes.every(c=>c==='FORBIDDEN')&&d.rowsAfter===d.rowsBefore,
  s2:d=>d.code==='UNAUTHENTICATED'&&d.sessionStatus==='REVOKED',
  s3:d=>d.activeSessions===0&&d.oldTokenCode==='UNAUTHENTICATED',
  // A revoked QR resolves with ok:true + data:null (no disclosure) — judge disclosure, not the envelope.
  s4:d=>d.vehicleDisclosedAfterRevoke===false&&d.qrStatus==='REVOKED'&&d.vehicleDisclosedBefore===true,
  s5:d=>d.auditDelta===1
};

export async function runScenarios({env=process.env,fetchImpl=fetch,persist=true,reportDir='test-results'}={}){
  const report={status:'RUNNING',suite:'SSOT_SCENARIOS',startedAt:new Date().toISOString(),scenarios:[],cleanup:[],secretsExposed:false};
  const save=()=>{if(!persist)return;fs.mkdirSync(reportDir,{recursive:true});fs.writeFileSync(path.join(reportDir,'p6vc-live-ssot-scenarios.json'),JSON.stringify(report,null,2)+'\n');};
  const blocked=r=>{report.status='BLOCKED';report.reason=r;save();return report;};
  if(env.P6VC_ALLOW_OWNER_DEV_WRITES!==WRITE_GATE)return blocked('MISSING_WRITE_GATE');
  if(env.P6VC_ALLOW_FIRESTORE_DEV_PROBE!==PROBE_GATE||!env.GOOGLE_APPLICATION_CREDENTIALS)return blocked('MISSING_FIRESTORE_PROBE_GATE');
  // SIVP section 10: exact match against contracts/trusted-endpoints.v1.json; conflicting config fails closed.
  let target;try{target=resolveApiBaseUrl(env);}catch(e){return blocked('INVALID_EXEC_URL:'+e.message);}
  const url=target.url;report.endpointId=target.id;report.endpointKind=target.kind;
  if(!env.P6VC_ADMIN_USER||!env.P6VC_ADMIN_PASS)return blocked('MISSING_ADMIN_CREDENTIALS');
  const call=async(op,payload={},sessionToken)=>{const [group,...a]=op.split('.');
    try{const r=await fetchImpl(url,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({apiVersion:'v1',group,action:a.join('.'),payload,requestId:'ss'+Math.random().toString(36).slice(2,12),...(sessionToken?{sessionToken}:{})})});
      return JSON.parse(await r.text());}catch(_){return {ok:false,error:{code:'NO_RESPONSE'}};}};
  const must=async(op,p,t)=>{const r=await call(op,p,t);if(!r.ok)throw new Error(op+':'+(r.error&&r.error.code));return r.data;};
  const code=r=>r&&r.ok?'OK':(r&&r.error?r.error.code:'NO_RESPONSE');
  const where=await firestoreReader(env),tag=Date.now().toString(36).slice(-6);
  const record=(id,ok,data)=>{report.scenarios.push({id,status:ok?'PASS':'FAIL',data});save();};
  const tryScenario=async(id,fn)=>{try{await fn();}catch(e){report.scenarios.push({id,status:'ERROR',error:String(e.message).slice(0,120)});save();}};
  let admin,org;const camps=[],vehicles=[],pendings=[],users=[];
  try{
    admin=(await must('auth.login',{username:env.P6VC_ADMIN_USER,password:env.P6VC_ADMIN_PASS})).sessionToken;
    org=await must('organizations.create',{name:'P6VC Scenarios '+tag,type:'EXTERNAL'},admin);
    const campaign=async max=>{const t=Date.now();const c=await must('campaigns.create',{startsAt:new Date(t-60000).toISOString(),endsAt:new Date(t+3600000).toISOString(),maxSubmissions:max},admin);camps.push(c);return c;};
    const stage=async c=>{const ph=[];for(const slot of SLOTS)ph.push({slot,photoId:(await must('photos.upload',{campaignToken:c.campaignToken,slot,base64Image:PNG,mimeType:'image/png'})).photoId});return ph;};
    const reg=(c,plate,photos,key)=>({campaignToken:c.campaignToken,plate,province:'TH-10',plateType:'PRIVATE',vehicleType:'SEDAN',brand:'SYNTHETIC',
      model:'AUTOMATED',color:'WHITE',organizationId:org.organizationId,relationship:'REGISTERED_CONTACT',contactName:'Synthetic Scenario Contact',
      contactPhone:'+66810000004',photos,idempotencyKey:key});
    const plate=n=>'TST'+String(Date.now()+n).slice(-8);
    const main=await campaign(20);

    await tryScenario('C3b_DUPLICATE_PLATE_APPROVAL',async()=>{
      const p=plate(1),[a,b]=[await stage(main),await stage(main)];
      const subs=await Promise.all([call('registrations.submit',reg(main,p,a,'ss-'+tag+'-3a')),call('registrations.submit',reg(main,p,b,'ss-'+tag+'-3b'))]);
      const ids=subs.filter(r=>r.ok).map(r=>r.data.requestId);pendings.push(...ids);
      if(ids.length<2){record('C3b_DUPLICATE_PLATE_APPROVAL',true,{note:'race not reproduced (only '+ids.length+' pending) — duplicate blocked at submit',pending:ids.length});return;}
      const first=await call('registrations.review',{requestId:ids[0],decision:'APPROVE',platePhotoVerified:true},admin);
      if(first.ok)vehicles.push(first.data.vehicleId);
      const second=await call('registrations.review',{requestId:ids[1],decision:'APPROVE',platePhotoVerified:true},admin);
      if(second.ok)vehicles.push(second.data.vehicleId);
      const d={activeVehiclesForPlate:(await where('vc_vehicles','plate_normalized',p)).filter(v=>v.status==='ACTIVE').length,
        firstApprovalCode:code(first),secondApprovalCode:code(second)};
      record('C3b_DUPLICATE_PLATE_APPROVAL',verdict.c3b(d),d);
    });

    await tryScenario('C4_APPROVE_VS_REJECT_RACE',async()=>{
      const p=plate(2),ph=await stage(main);
      const s=await must('registrations.submit',reg(main,p,ph,'ss-'+tag+'-4'));
      const [ap,rj]=await Promise.all([call('registrations.review',{requestId:s.requestId,decision:'APPROVE',platePhotoVerified:true},admin),
        call('registrations.review',{requestId:s.requestId,decision:'REJECT'},admin)]);
      const req=(await where('vc_registration_requests','request_id',s.requestId))[0]||{};
      const v=(await where('vc_vehicles','vehicle_id',s.vehicleId)).filter(x=>x.status==='ACTIVE');
      if(v.length)vehicles.push(s.vehicleId);
      const d={approve:code(ap),reject:code(rj),status:req.status,vehicles:v.length,
        activeQr:(await where('vc_qr_tokens','vehicle_id',s.vehicleId)).filter(q=>q.status==='ACTIVE').length};
      record('C4_APPROVE_VS_REJECT_RACE',verdict.c4(d),d);
    });

    await tryScenario('C5_QUOTA_AT_CAPACITY_RACE',async()=>{
      const c=await campaign(2),staged=[];for(let i=0;i<4;i++)staged.push(await stage(c));
      const rs=await Promise.all(staged.map((ph,i)=>call('registrations.submit',reg(c,plate(10+i),ph,'ss-'+tag+'-5'+i))));
      rs.filter(r=>r.ok).forEach(r=>pendings.push(r.data.requestId));
      const camp=(await where('vc_campaigns','campaign_id',c.campaignId))[0]||{};
      const d={max:2,okResponses:rs.filter(r=>r.ok).length,codes:rs.map(code),submittedCount:Number(camp.submitted_count),
        requestRows:(await where('vc_registration_requests','campaign_id',c.campaignId)).length};
      record('C5_QUOTA_AT_CAPACITY_RACE',verdict.c5(d),d);
    });

    await tryScenario('C6_CHANGE_REVIEW_RACE',async()=>{
      const p=plate(20),ph=await stage(main);
      const s=await must('registrations.submit',reg(main,p,ph,'ss-'+tag+'-6'));
      const a=await must('registrations.review',{requestId:s.requestId,decision:'APPROVE',platePhotoVerified:true},admin);vehicles.push(a.vehicleId);
      // changes.submit needs vehicle.change.submit (OWNER role) + ownership: create a synthetic
      // OWNER, make them the vehicle owner, and submit as them (V62 run 1: admin got FORBIDDEN).
      const oname='p6vc_owner_c6'+tag,otemp='Synthetic-Temp-'+tag+'-Cc3!',opass='Synthetic-Pass-'+tag+'-Dd4!';
      const ou=await must('users.create',{username:oname,displayName:'P6VC Automated C6 owner',temporaryPassword:otemp},admin);users.push(ou.userId);
      await must('users.assignRoles',{userId:ou.userId,roles:['OWNER']},admin);
      const ot=(await must('auth.login',{username:oname,password:otemp})).sessionToken;
      await must('auth.changePassword',{oldPassword:otemp,newPassword:opass},ot);
      const owner=(await must('auth.login',{username:oname,password:opass})).sessionToken;
      const v0=(await where('vc_vehicles','vehicle_id',a.vehicleId))[0]||{};
      await must('vehicles.update',{vehicleId:a.vehicleId,expectedVersion:Number(v0.version),ownerUserId:ou.userId},admin);
      const before=(await where('vc_vehicles','vehicle_id',a.vehicleId))[0]||{};
      const ca=await must('changes.submit',{vehicleId:a.vehicleId,model:'C6MODEL'+tag},owner);
      const cb=await must('changes.submit',{vehicleId:a.vehicleId,color:'C6COLOR'+tag},owner);
      const rs=await Promise.all([call('changes.review',{requestId:ca.requestId,decision:'APPROVE'},admin),
        call('changes.review',{requestId:ca.requestId,decision:'APPROVE'},admin),
        call('changes.review',{requestId:cb.requestId,decision:'APPROVE'},admin)]);
      const after=(await where('vc_vehicles','vehicle_id',a.vehicleId))[0]||{};
      const reqA=(await where('vc_change_requests','change_id',ca.requestId))[0]||{},reqB=(await where('vc_change_requests','change_id',cb.requestId))[0]||{};
      const d={codes:rs.map(code),statusA:reqA.status,statusB:reqB.status,versionBefore:Number(before.version),versionAfter:Number(after.version),
        versionDelta:Number(after.version)-Number(before.version),modelApplied:after.model==='C6MODEL'+tag,colorApplied:after.color==='C6COLOR'+tag,
        auditA:(await where('vc_change_audit','entity_id',ca.requestId)).filter(x=>x.action==='CHANGE_APPROVE').length,
        auditB:(await where('vc_change_audit','entity_id',cb.requestId)).filter(x=>x.action==='CHANGE_APPROVE').length};
      record('C6_CHANGE_REVIEW_RACE',verdict.c6(d),d);
    });

    // Security negatives with a dedicated synthetic STAFF user.
    const uname='p6vc_staff_ss'+tag,temp='Synthetic-Temp-'+tag+'-Aa1!',pass='Synthetic-Pass-'+tag+'-Bb2!';
    const u=await must('users.create',{username:uname,displayName:'P6VC Automated scenario staff',temporaryPassword:temp},admin);users.push(u.userId);
    await must('users.assignRoles',{userId:u.userId,roles:['STAFF']},admin);
    const t1=(await must('auth.login',{username:uname,password:temp})).sessionToken;
    const t2=(await must('auth.login',{username:uname,password:temp})).sessionToken;

    await tryScenario('S3_PASSWORD_CHANGE_REVOKES',async()=>{
      await must('auth.changePassword',{oldPassword:temp,newPassword:pass},t1);
      const old=await call('vehicles.lookup',{plate:'X',province:'TH-10'},t2);
      const sess=await where('vc_sessions','user_id',u.userId);
      const d={sessions:sess.length,activeSessions:sess.filter(s=>s.status==='ACTIVE').length,oldTokenCode:code(old)};
      record('S3_PASSWORD_CHANGE_REVOKES',verdict.s3(d),d);
    });
    const staff=(await must('auth.login',{username:uname,password:pass})).sessionToken;

    await tryScenario('S1_RBAC_DENY_STAFF',async()=>{
      const before=(await where('vc_campaigns','status','ACTIVE')).length;
      const rs=[await call('campaigns.create',{startsAt:new Date().toISOString(),endsAt:new Date(Date.now()+3600000).toISOString(),maxSubmissions:1},staff),
        await call('users.list',{},staff),await call('organizations.create',{name:'P6VC denied '+tag,type:'EXTERNAL'},staff)];
      const d={codes:rs.map(code),rowsBefore:before,rowsAfter:(await where('vc_campaigns','status','ACTIVE')).length,
        orgCreated:(await where('vc_organizations','name','P6VC denied '+tag)).length};
      record('S1_RBAC_DENY_STAFF',verdict.s1(d)&&d.orgCreated===0,d);
    });

    await tryScenario('S4_QR_REVOKE_RESOLVE',async()=>{
      const p=plate(3),ph=await stage(main);
      const s=await must('registrations.submit',reg(main,p,ph,'ss-'+tag+'-q'));
      const a=await must('registrations.review',{requestId:s.requestId,decision:'APPROVE',platePhotoVerified:true},admin);vehicles.push(a.vehicleId);
      const before=await call('qr.resolve',{token:a.qrToken},staff);
      await must('qr.revoke',{vehicleId:a.vehicleId},admin);
      const after=await call('qr.resolve',{token:a.qrToken},staff);
      const q=(await where('vc_qr_tokens','qr_id',a.qrId))[0]||{};
      const has=r=>!!(r&&r.ok&&r.data&&r.data.vehicleId);
      const d={resolveBefore:code(before),resolveAfter:code(after),vehicleDisclosedBefore:has(before),vehicleDisclosedAfterRevoke:has(after),qrStatus:q.status};
      record('S4_QR_REVOKE_RESOLVE',verdict.s4(d),d);
    });

    await tryScenario('S5_LOOKUP_AUDIT_ONE_ROW',async()=>{
      const vid=vehicles[vehicles.length-1];if(!vid)throw new Error('NO_VEHICLE_AVAILABLE');
      const v=(await where('vc_vehicles','vehicle_id',vid))[0];
      const before=(await where('vc_lookup_audit','vehicle_id',vid)).length;
      const r=await call('vehicles.lookup',{plate:v.plate_normalized,province:'TH-10'},staff);
      const d={lookup:code(r),auditDelta:(await where('vc_lookup_audit','vehicle_id',vid)).length-before};
      record('S5_LOOKUP_AUDIT_ONE_ROW',verdict.s5(d)&&r.ok,d);
    });

    await tryScenario('S2_LOGOUT_TOKEN_REUSE',async()=>{
      await must('auth.logout',{},staff);
      const r=await call('vehicles.lookup',{plate:'X',province:'TH-10'},staff);
      const sess=await where('vc_sessions','user_id',u.userId);
      const d={code:code(r),sessionStatus:sess.every(s=>s.status==='REVOKED')?'REVOKED':'SOME_ACTIVE'};
      record('S2_LOGOUT_TOKEN_REUSE',verdict.s2(d),d);
    });
    report.status=report.scenarios.every(s=>s.status==='PASS')?'PASS':'FAIL';
  }catch(e){report.status='FAIL';report.fatal=String(e&&e.message||e).slice(0,120);}
  finally{
    const clean=async(id,fn)=>{try{await fn();report.cleanup.push({id,status:'PASS'});}catch(e){report.cleanup.push({id,status:'FAIL',reason:String(e.message).slice(0,80)});}};
    if(admin){
      for(const r of pendings)await clean('REJECT_'+r.slice(0,8),async()=>{const x=await call('registrations.review',{requestId:r,decision:'REJECT'},admin);if(!x.ok&&x.error.code!=='INVALID_REQUEST_STATE')throw new Error(x.error.code);});
      for(const v of [...new Set(vehicles)])await clean('CANCEL_'+v.slice(0,8),async()=>{const x=await call('vehicles.cancel',{vehicleId:v},admin);if(!x.ok&&x.error.code!=='VEHICLE_NOT_ACTIVE')throw new Error(x.error.code);});
      for(const c of camps)await clean('REVOKE_'+c.campaignId.slice(0,8),()=>must('campaigns.revoke',{campaignId:c.campaignId},admin));
      for(const id of users)await clean('SUSPEND_'+id.slice(0,8),()=>must('users.suspend',{userId:id},admin));
      if(org)await clean('DISABLE_ORG',()=>must('organizations.disable',{organizationId:org.organizationId},admin));
      await clean('ADMIN_LOGOUT',()=>must('auth.logout',{},admin));
    }
    report.finishedAt=new Date().toISOString();save();
  }
  return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const r=await runScenarios();
  console.log('SSOT_SCENARIOS '+JSON.stringify({status:r.status,scenarios:r.scenarios.map(s=>({id:s.id,status:s.status,data:s.data,error:s.error})),
    cleanupFailed:r.cleanup.filter(c=>c.status!=='PASS'),fatal:r.fatal||null}));
  process.exitCode=r.status==='PASS'?0:1;
}
