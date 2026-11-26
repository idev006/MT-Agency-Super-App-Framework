// P6VC LIVE HTTP acceptance, initiated only by explicitly authorized GitHub Actions.
// A successful synthetic-sandbox credential+vehicle fingerprint is REQUIRED before
// any business-data mutation. No credential/token/photo data is ever printed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const url=process.env.P6VC_GAS_EXEC_URL;
assert.ok(url&&/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(url));
const inventory=JSON.parse(fs.readFileSync(new URL('../../../contracts/api-inventory.v1.json',import.meta.url),'utf8'));
const totalOps=inventory.operations.length;
const runner={status:'RUNNING',environment:'REMOTE_GAS_WEB_APP',target:url,sourceCommit:process.env.GITHUB_SHA||null,
 startedAt:new Date().toISOString(),tests:[],blocked:[],scope:'Public ingress checks + guarded synthetic-sandbox auth/business E2E'};
const save=()=>{
 runner.finishedAt=new Date().toISOString();
 fs.mkdirSync('test-results',{recursive:true});
 fs.writeFileSync('test-results/p6vc-live-http-acceptance.json',JSON.stringify(runner,null,2)+'\n');
 console.log('FINAL '+JSON.stringify({status:runner.status,pass:runner.tests.filter(x=>x.status==='PASS').length,
  failed:runner.tests.filter(x=>x.status==='FAIL').length,blocked:runner.blocked.length,reason:runner.reason||null,
  target:runner.target,seconds:Math.round((Date.parse(runner.finishedAt)-Date.parse(runner.startedAt))/1000)}));
};
const request=async (group,action,payload={},opts={})=>{
 const body={apiVersion:opts.version||'v1',group,action,payload,...(opts.token?{sessionToken:opts.token}:{}),
  ...(opts.requestId?{requestId:opts.requestId}:{})};
 const response=await fetch(url,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},
  body:JSON.stringify(body),signal:AbortSignal.timeout(40000)});
 const raw=await response.text();let parsed;
 try{parsed=JSON.parse(raw);}catch{throw Error('NON_JSON_RESPONSE: HTTP '+response.status+'; end host '+new URL(response.url).hostname);}
 if(!parsed||typeof parsed.ok!=='boolean'||!Object.hasOwn(parsed,'error')||!Object.hasOwn(parsed,'data'))
  throw Error('INVALID_API_ENVELOPE');
 return {http:response.status,body:parsed};
};
const health=async()=>{
 const r=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(40000)});
 const text=await r.text();let body;
 try{body=JSON.parse(text);}catch{throw Error('HEALTH_NON_JSON: HTTP '+r.status);}
 return {http:r.status,body};
};
const test=async(id,callback,{critical=false}={})=>{
 const start=Date.now();
 try{
  const result=await callback();
  runner.tests.push({id,status:'PASS',durationMs:Date.now()-start,
   ...(result&&result.note?{note:result.note}:{})});
  console.log('PASS '+id+' '+(Date.now()-start)+'ms');
  return {ok:true,result};
 }catch(e){
  runner.tests.push({id,status:'FAIL',durationMs:Date.now()-start,
   reason:String(e?.message||e).slice(0,200)});
  console.log('FAIL '+id+' '+String(e?.message||e).slice(0,140));
  if(critical)throw e;
  return {ok:false};
 }
};
const expect=(r,ok,code)=>{
 assert.equal(r.http,200,'HTTP status');
 assert.equal(r.body.ok,ok,'logical ok');
 if(code)assert.equal(r.body.error?.code,code,'logical error code');
 else if(ok)assert.equal(r.body.error,null,'no error for success');
 return r.body.data;
};
const authenticated=(op,token,payload={})=>request(...op.split('.'),payload,{token});
const responseCode=r=>r.body.error?.code||null;
const check=async()=> {
 const a=await test('LIVE-01.GET_HEALTH',async()=>{
  const r=await health();const data=expect(r,true);assert.equal(data?.status,'ready');assert.equal(data?.apiVersion,'v1');
 },{critical:true});
 await test('LIVE-02.POST_HEALTH',async()=>{const r=await request('system','health');assert.equal(expect(r,true).status,'ready')});
 await test('LIVE-03.BAD_VERSION',async()=>{expect(await request('system','health',{}, {version:'v9'}),false,'BAD_REQUEST')});
 await test('LIVE-04.BAD_PAYLOAD',async()=>{
  const r=await request('system','health',[]);expect(r,false,'BAD_REQUEST');
 });
 await test('LIVE-05.UNKNOWN_ROUTE',async()=>{expect(await request('unknown','read'),false,'NOT_FOUND')});
 await test('LIVE-06.PROTO_GROUP',async()=>{expect(await request('__proto__','constructor'),false,'BAD_REQUEST')});
 await test('LIVE-07.UNKNOWN_VALID_GROUP_ROUTE',async()=>{expect(await request('vehicles','doesnotexist'),false,'NOT_FOUND')});
 await test('LIVE-08.INVALID_CORRELATION',async()=>{
  const r=await request('system','health',{}, {requestId:'unsafe space'});expect(r,true);assert.equal(r.body.requestId,null);
 });
 await test('LIVE-09.CORRELATION_ECHO',async()=>{
  const r=await request('system','health',{}, {requestId:'P6VCsafeHTTP01'});expect(r,true);assert.equal(r.body.requestId,'P6VCsafeHTTP01');
 });
 await test('LIVE-10.OVERSIZE_NONMEDIA',async()=>{
  const response=await fetch(url,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain'},
   body:JSON.stringify({apiVersion:'v1',group:'system',action:'health',payload:{filler:'x'.repeat(8200)}}),
   signal:AbortSignal.timeout(40000)});
  assert.equal(response.status,200);
  const parsed=JSON.parse(await response.text());assert.equal(parsed.ok,false);assert.equal(parsed.error?.code,'BAD_REQUEST');
 });
 // Capability probes are non-mutating (unless login is enabled; no password submitted here).
 let isEnabled=false;
 const gate=await test('LIVE-11.AUTH_GATE_STATUS',async()=>{
  const r=await request('auth','login',{});
  expect(r,false);
  const code=responseCode(r);
  assert.ok(['SERVICE_UNAVAILABLE','INVALID_REQUEST'].includes(code),'unexpected auth gate '+code);
  isEnabled=(code==='INVALID_REQUEST');
  return {note:'gate='+code};
 });
 await test('LIVE-12.PROTECTED_GATE_STATUS',async()=>{
  const r=await request('vehicles','lookup',{plate:'TST-HTTP',province:'TH-10'});
  expect(r,false,isEnabled?'UNAUTHENTICATED':'SERVICE_UNAVAILABLE');
 });
 if(!a.ok||!gate.ok){runner.status='FAIL';runner.reason='Public route capability preflight unexpectedly failed';return;}
 if(!isEnabled){
  runner.status=runner.tests.some(x=>x.status==='FAIL')?'FAIL':'PASS_PARTIAL_BLOCKED';
  runner.reason='Protected HTTP dispatcher returned SERVICE_UNAVAILABLE. This is consistent with VEHICLE_API_ENABLED disabled, but may also indicate missing protected-service configuration. No authenticated business API could be exercised.';
  runner.blocked.push({scope:'Non-health business API operations',status:'BLOCKED_BY_FEATURE_GATE',count:totalOps-1,
   note:'Catalog operations blocked, not executed; DO NOT label 49 tests as passed'});
  console.log('GATE CLOSED: authenticated /exec tests blocked, no synthetic credentials sent');
  return;
 }
 // Authenticated tests only with pre-provisioned synthetic staging fixture.
 const pass='P6VC-Test-Only-2026-11-17!';
 const tokens={},names=['test_sysadmin','test_registration','test_staff','test_owner','test_worker','test_firstlogin'];
 const login=async name=>{
  const r=await request('auth','login',{username:name,password:pass});
  return expect(r,true).sessionToken;
 };
 const sys=await test('LIVE-13.SYNTHETIC_SYSADMIN_LOGIN',async()=>{tokens.test_sysadmin=await login('test_sysadmin');assert.match(tokens.test_sysadmin,/^[0-9a-f]{64}$/i);},{critical:false});
 if(!sys.ok){
  runner.status='BLOCKED_STAGING_IDENTITY_MISMATCH';runner.reason='Enabled endpoint does not authenticate synthetic test_sysadmin; cannot prove target is isolated sandbox, so write tests stopped';
  runner.blocked.push({scope:'Live authenticated role/use-case tests',status:'STOPPED_BY_SANDBOX_IDENTITY_GUARD'});
  return;
 }
 const staff=await test('LIVE-14.SYNTHETIC_STAFF_LOGIN',async()=>{tokens.test_staff=await login('test_staff')});
 if(!staff.ok){
  runner.status='BLOCKED_STAGING_IDENTITY_MISMATCH';runner.reason='STAFF fixture account cannot authenticate; not safe to proceed';return;
 }
 const sentinel=await test('LIVE-15.SANDBOX_VEHICLE_FINGERPRINT',async()=>{
  const r=await authenticated('vehicles.lookup',tokens.test_staff,{plate:'กข 1234',province:'TH-10'});
  const data=expect(r,true);
  assert.equal(data?.vehicleId,'vehicle-sandbox-001');
  assert.equal(data?.photos?.length,5);
  assert.equal(data?.contacts?.length,1);
 });
 if(!sentinel.ok){
  runner.status='BLOCKED_STAGING_DATA_MISMATCH';
  runner.reason='Synthetic sandbox vehicle fingerprint not proven. Preventing all HTTP mutations.';
  runner.blocked.push({scope:'All write use cases',status:'STOPPED_BY_SANDBOX_DATA_GUARD'});
  return;
 }
 // Everything below operates only when two synthetic role logins and seeded vehicle fingerprint pass.
 for(const name of names.filter(x=>!tokens[x]))await test('LIVE-AUTH.LOGIN.'+name,async()=>{tokens[name]=await login(name)});
 for(const [name,token] of Object.entries(tokens))await test('LIVE-AUTH.SESSION.'+name,async()=>{
  const r=await authenticated('auth.session',token);const d=expect(r,true);assert.ok(d.roles.length);
 });
 await test('LIVE-RBAC.SYS_CONFIG',async()=>{
  const d=expect(await authenticated('system.config.get',tokens.test_sysadmin),true);assert.equal(String(d.idle_timeout_minutes),'30');
 });
 await test('LIVE-RBAC.STAFF_CONFIG_DENIED',async()=>{expect(await authenticated('system.config.get',tokens.test_staff),false,'FORBIDDEN')});
 await test('LIVE-RBAC.SYS_REG_APPROVAL_DENIED',async()=>{expect(await authenticated('registrations.listPending',tokens.test_sysadmin),false,'FORBIDDEN')});
 await test('LIVE-RBAC.OWNER_CONTACT_DENIED',async()=>{expect(await authenticated('contacts.read',tokens.test_owner,{vehicleId:'vehicle-sandbox-001'}),false,'FORBIDDEN')});
 await test('LIVE-RBAC.WORKER_USERS_DENIED',async()=>{expect(await authenticated('users.list',tokens.test_worker),false,'FORBIDDEN')});
 await test('LIVE-AUTH.FIRSTLOGIN_CHANGE_REQUIRED',async()=>{
  const r=await authenticated('auth.session',tokens.test_firstlogin);
  const d=expect(r,true);assert.equal(d.mustChangePassword,true);
  expect(await authenticated('organizations.list',tokens.test_firstlogin),false,'PASSWORD_CHANGE_REQUIRED');
 });
 await test('LIVE-AUTH.BAD_PASSWORD',async()=>{
  expect(await request('auth','login',{username:'test_staff',password:'Wrong-Synthetic-Only-2026!'}),false,'INVALID_CREDENTIALS');
 });
 await test('LIVE-LOOKUP.CONTACTS',async()=>{
  const d=expect(await authenticated('contacts.read',tokens.test_staff,{vehicleId:'vehicle-sandbox-001'}),true);
  assert.equal(d.length,1);
 });
 await test('LIVE-LOOKUP.PHOTOS',async()=>{
  const d=expect(await authenticated('photos.list',tokens.test_staff,{vehicleId:'vehicle-sandbox-001'}),true);assert.equal(d.length,5);
 });
 await test('LIVE-LOOKUP.QR_RESOLVE',async()=>{
  const d=expect(await authenticated('qr.resolve',tokens.test_staff,{token:'deadbeef'.repeat(8)}),true);
  assert.equal(d?.vehicleId,'vehicle-sandbox-001');
 });
 // Reversible synthetic lifecycle only. Never affect seeded fixture vehicle.
 const state={};
 const criticalStep=async(id,fn)=>test(id,fn);
 const now=Date.now(),plate='TST'+String(now).slice(-8);
 const camp=await criticalStep('LIVE-FLOW.CAMPAIGN_CREATE',async()=>{
  state.campaign=expect(await authenticated('campaigns.create',tokens.test_sysadmin,{
   startsAt:new Date(now-60000).toISOString(),endsAt:new Date(now+3600000).toISOString(),maxSubmissions:2
  }),true);
  assert.ok(state.campaign?.campaignToken);
 });
 if(!camp.ok){runner.reason='Campaign creation failed';return;}
 state.photos=[];
 const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/C7sAAAAASUVORK5CYII=';
 for(const slot of ['FRONT','REAR','LEFT','RIGHT','FRONT_ANGLE']){
  const r=await criticalStep('LIVE-FLOW.PHOTO_'+slot,async()=>{
   const data=expect(await request('photos','upload',{campaignToken:state.campaign.campaignToken,slot,base64Image:PNG,mimeType:'image/png'}),true);
   state.photos.push({slot,photoId:data.photoId});
  });
  if(!r.ok){runner.reason='Photo staging failed; stop remaining lifecycle';return;}
 }
 const payload={campaignToken:state.campaign.campaignToken,plate,province:'TH-10',plateType:'PRIVATE',vehicleType:'SEDAN',
  brand:'SYNTHETIC',model:'HTTP_ACCEPTANCE',color:'WHITE',organizationId:'org-test-police',
  relationship:'REGISTERED_CONTACT',contactName:'Synthetic HTTP Contact',contactPhone:'+66810000002',
  photos:state.photos,idempotencyKey:'http-'+plate};
 const submitted=await criticalStep('LIVE-FLOW.REGISTRATION_SUBMIT',async()=>{
  state.registration=expect(await request('registrations','submit',payload),true);assert.equal(state.registration.status,'PENDING_APPROVAL');
 });
 if(!submitted.ok){runner.reason='Registration submit failed; stop remaining lifecycle';return;}
 await test('LIVE-FLOW.IDEMPOTENCY_REPLAY',async()=>{
  const repeat=expect(await request('registrations','submit',payload),true);
  assert.equal(repeat.requestId,state.registration.requestId);
 });
 await test('LIVE-FLOW.PENDING_VISIBLE',async()=>{
  const d=expect(await authenticated('registrations.listPending',tokens.test_registration),true);
  assert.ok(d.some(x=>x.requestId===state.registration.requestId));
 });
 const approved=await criticalStep('LIVE-FLOW.APPROVE',async()=>{
  state.approved=expect(await authenticated('registrations.review',tokens.test_registration,{
   requestId:state.registration.requestId,decision:'APPROVE',stickerCategory:'NCO',platePhotoVerified:true
  }),true);assert.equal(state.approved.status,'APPROVED');
 });
 if(!approved.ok){runner.reason='Approval failed; stop lifecycle';return;}
 await test('LIVE-FLOW.STAFF_LOOKUP_CREATED',async()=>{
  const d=expect(await authenticated('vehicles.lookup',tokens.test_staff,{plate,province:'TH-10'}),true);
  assert.equal(d?.vehicleId,state.approved.vehicleId);
 });
 const owner=await criticalStep('LIVE-FLOW.REGISTER_OWNER',async()=>{
  expect(await authenticated('vehicles.update',tokens.test_registration,{
   vehicleId:state.approved.vehicleId,expectedVersion:1,ownerUserId:'u-sandbox-4'
  }),true);
 });
 if(owner.ok){
  const change=await criticalStep('LIVE-FLOW.OWNER_CHANGE_REQUEST',async()=>{
   state.change=expect(await authenticated('changes.submit',tokens.test_owner,{vehicleId:state.approved.vehicleId,color:'ORANGE'}),true);
  });
  if(change.ok)await test('LIVE-FLOW.APPROVE_OWNER_CHANGE',async()=>{
   expect(await authenticated('changes.review',tokens.test_registration,{requestId:state.change.requestId,decision:'APPROVE'}),true);
  });
 }
 await test('LIVE-FLOW.QR_ROTATE',async()=>{
  const rotated=expect(await authenticated('qr.replace',tokens.test_registration,{vehicleId:state.approved.vehicleId,reason:'DAMAGED'}),true);
  assert.ok(rotated.token);
  assert.equal(expect(await authenticated('qr.resolve',tokens.test_staff,{token:state.approved.qrToken}),false,'QR_REVOKED'),null);
  assert.equal(expect(await authenticated('qr.resolve',tokens.test_staff,{token:rotated.token}),true).vehicleId,state.approved.vehicleId);
 });
 await test('LIVE-FLOW.REPLACE_PHOTO',async()=>{
  const d=expect(await authenticated('photos.replace',tokens.test_registration,{
   vehicleId:state.approved.vehicleId,slot:'FRONT',base64Image:PNG,mimeType:'image/png'
  }),true);assert.equal(d.replaced,true);
 });
 await test('LIVE-FLOW.CANCEL',async()=>{
  const d=expect(await authenticated('vehicles.cancel',tokens.test_registration,{vehicleId:state.approved.vehicleId}),true);
  assert.equal(d.status,'INACTIVE');
 });
 await test('LIVE-RETENTION.DUE_ONLY',async()=>{
  const items=expect(await authenticated('retention.listDue',tokens.test_sysadmin),true);
  assert.ok(Array.isArray(items));
 });
 await test('LIVE-RETENTION.NOT_DUE_DENIED',async()=>{
  expect(await authenticated('retention.approve',tokens.test_sysadmin,{jobId:'no-such-job'}),false,'RETENTION_NOT_APPROVABLE');
 });
 await test('LIVE-AUTH.LOGOUT',async()=>{
  expect(await authenticated('auth.logout',tokens.test_staff),true);
  expect(await authenticated('auth.session',tokens.test_staff),false,'UNAUTHENTICATED');
 });
 runner.status=runner.tests.some(x=>x.status==='FAIL')?'FAIL':'PASS';
};
try{await check();}
catch(e){runner.status='FAIL';runner.reason=String(e?.message||e).slice(0,180);}
finally{save(); if(runner.status==='FAIL')process.exitCode=1;}
