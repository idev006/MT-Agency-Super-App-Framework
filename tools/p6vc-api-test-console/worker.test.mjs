import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';

const BASE='https://console.example';
const GAS='https://script.google.com/macros/s/TEST-DEPLOY-ID/exec';
const KEY='a'.repeat(48);
const PASSWORD='test-password-only-not-real-1234';
const TOKEN='a'.repeat(64);
function env(){return {P6VC_GAS_EXEC_URL:GAS,BRIDGE_ACCESS_KEY:KEY,
 TEST_LOGIN_USERNAME:'staging-admin',TEST_LOGIN_PASSWORD:PASSWORD};}
function request(path,body,auth=true){
 return new Request(BASE+path,{method:'POST',headers:{
  ...(auth?{authorization:'Bearer '+KEY}:{}),
  ...(body!==undefined?{'content-type':'application/json'}:{})
 },...(body!==undefined?{body:JSON.stringify(body)}:{})});
}
const envelope=(ok,data=null,error=null)=>new Response(JSON.stringify({ok,data,error}),{
 status:200,headers:{'content-type':'application/json'}
});
async function fakeGAS(callback){
 const prior=globalThis.fetch;
 const calls=[];
 globalThis.fetch=async (url,init)=>{
  assert.equal(url,GAS,'Worker must use only server-pinned GAS URL');
  const body=init.body?JSON.parse(init.body):{apiVersion:'v1',group:'system',action:'health',payload:{}};
  calls.push(body);
  return callback(body,init);
 };
 return {calls,restore(){globalThis.fetch=prior;}};
}
test('page renders input boxes and no embedded password or token',async()=>{
 const r=await worker.fetch(new Request(BASE+'/'),env());
 const html=await r.text();
 assert.equal(r.status,200);
 for(const id of ['op','method','payload','reqid','testuser','testpass','probe']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.ok(html.includes('content-security-policy')===false);
 assert.ok(r.headers.get('content-security-policy')?.includes('nonce-'));
 assert.ok(!html.includes(PASSWORD));
});
test('access key is mandatory even for health and probes',async()=>{
 for(const path of ['/api/health','/api/probe']){
  const r=await worker.fetch(request(path,{operation:'system.health',payload:{}},false),env());
  assert.equal(r.status,401);
 }
});
test('write operation and arbitrary API URL cannot be proxied',async()=>{
 for(const op of ['users.create','vehicles.update','auth.changePassword','photos.upload','audit.export']){
  const r=await worker.fetch(request('/api/probe',{operation:op,method:'POST',payload:{},url:'https://evil.invalid'}),env());
  assert.equal(r.status,403);
 }
});
test('payload containing password, token, credentials is rejected',async()=>{
 for(const payload of [{password:'not-sent'},{sessionToken:'secret'},{nested:{authorization:'a'}}]){
  const r=await worker.fetch(request('/api/probe',{operation:'users.list',payload}),env());
  assert.equal(r.status,403);
 }
});
test('read-only health API reached backend; report has no raw data',async()=>{
 const fake=await fakeGAS(()=>envelope(true,{status:'bootstrap',private:'DO_NOT_EXPOSE'}));
 try{
  const r=await worker.fetch(request('/api/probe',{operation:'system.health',method:'POST',payload:{},requestId:'qaTest-001'}),env());
  const j=await r.json();
  assert.equal(r.status,200);
  assert.equal(j.kind,'probe');
  assert.equal(j.backend?.ok,true);
  assert.equal(j.operation,'system.health');
  assert.equal(j.requestId,'qaTest-001');
  assert.equal(fake.calls.length,1);
  assert.ok(!JSON.stringify(j).includes('DO_NOT_EXPOSE'));
 }finally{fake.restore();}
});
test('authenticated read probe logs out and redacts response, username, password and token',async()=>{
 const fake=await fakeGAS(body=>{
  if(body.group==='auth'&&body.action==='login')return envelope(true,{sessionToken:TOKEN});
  if(body.group==='auth'&&body.action==='logout')return envelope(true,{revoked:true});
  if(body.group==='users'&&body.action==='list')
   return envelope(true,[{userId:'PRIVATE_USER_ID',phone:'PRIVATE_PHONE'}]);
  return envelope(false,null,{code:'NOT_FOUND'});
 });
 try{
  const r=await worker.fetch(request('/api/probe',{operation:'users.list',payload:{limit:1},method:'POST',
   useTestSession:true,username:'qa-user',password:PASSWORD}),env());
  const j=await r.json();
  const raw=JSON.stringify(j);
  assert.equal(j.backend?.ok,true);
  assert.equal(j.authenticated,true);
  assert.equal(j.logoutRevoked,true);
  assert.deepEqual(fake.calls.map(c=>c.group+'.'+c.action),['auth.login','users.list','auth.logout']);
  for(const secret of ['PRIVATE_USER_ID','PRIVATE_PHONE',PASSWORD,TOKEN,'qa-user'])assert.ok(!raw.includes(secret),secret);
 }finally{fake.restore();}
});
test('backend policy denial is reported without leaking raw error messages',async()=>{
 const fake=await fakeGAS(body=>envelope(false,null,{code:'PASSWORD_CHANGE_REQUIRED',
 message:'DO_NOT_EXPOSE_DETAILS'}));
 try{
  const r=await worker.fetch(request('/api/probe',{operation:'organizations.list',payload:{}}),env());
  const j=await r.json();
  assert.equal(j.backend?.ok,false);
  assert.equal(j.backend?.errorCode,'PASSWORD_CHANGE_REQUIRED');
  assert.equal(j.transport,'PASS');
  assert.ok(!JSON.stringify(j).includes('DO_NOT_EXPOSE_DETAILS'));
 }finally{fake.restore();}
});
test('health 2/2 remains supported',async()=>{
 const fake=await fakeGAS(()=>envelope(true,{status:'bootstrap'}));
 try{
  const r=await worker.fetch(request('/api/health'),env());
  const j=await r.json();
  assert.equal(j.kind,'health');
  assert.equal(j.passed,2);
  assert.equal(j.failed,0);
 }finally{fake.restore();}
});

test('auth suite accepts temporary form credentials, never echoes them, revokes session',async()=>{
 let revoked=false;
 const manualUser='temporary-operator',manualPass='only-for-mock-test-123456789';
 const fake=await fakeGAS(body=>{
  if(body.group==='system'&&body.action==='health')return envelope(true,{status:'bootstrap'});
  if(body.group==='auth'&&body.action==='login'){
   if(!body.payload.username)return envelope(false,null,{code:'INVALID_REQUEST'});
   assert.equal(body.payload.username,manualUser);
   assert.equal(body.payload.password,manualPass);
   return envelope(true,{sessionToken:TOKEN});
  }
  if(body.group==='auth'&&body.action==='session'){
   if(!body.sessionToken||revoked)return envelope(false,null,{code:'UNAUTHENTICATED'});
   return envelope(true,{roles:['SYSTEM_ADMIN'],mustChangePassword:true});
  }
  if(body.group==='auth'&&body.action==='logout'){revoked=true;return envelope(true,{revoked:true});}
  throw Error('Unexpected logical operation');
 });
 try{
  const r=await worker.fetch(request('/api/auth-suite',{username:manualUser,password:manualPass}),env());
  const j=await r.json();
  assert.equal(r.status,200);
  assert.equal(j.result,'PASS');
  assert.equal(j.passed,8);
  assert.equal(j.failed,0);
  assert.equal(revoked,true);
  for(const value of [manualUser,manualPass,TOKEN])assert.ok(!JSON.stringify(j).includes(value));
 }finally{fake.restore();}
});
test('partial form credential does not silently combine with Worker secret',async()=>{
 const r=await worker.fetch(request('/api/auth-suite',{username:'only-user'}),env());
 const j=await r.json();
 assert.equal(j.result,'FAIL');
 assert.equal(j.tests[0].error,'CREDENTIAL_PAIR_REQUIRED');
});

test('data-driven suite runs multiple read-only cases, checks business error not just HTTP',async()=>{
 const mock=await fakeGAS(body=>{
  if(body.group==='system'&&body.action==='health')return envelope(true,{status:'bootstrap'});
  if(body.group==='users'&&body.action==='list')
   return envelope(false,null,{code:'UNAUTHENTICATED',message:'DO_NOT_LEAK'});
  throw Error('Unexpected operation');
 });
 try{
  const r=await worker.fetch(request('/api/run-tests',{
   suiteId:'smoke-anonymous',
   cases:[
    {id:'S-01',operation:'system.health',method:'POST',payload:{},expected:{ok:true}},
    {id:'S-02',operation:'users.list',method:'POST',payload:{limit:1},expected:{ok:false,errorCode:'UNAUTHENTICATED'}}
   ]
  }),env());
  assert.equal(r.status,200);
  const j=await r.json();
  assert.equal(j.status,'PASS');assert.equal(j.passed,2);assert.equal(j.failed,0);
  assert.deepEqual(mock.calls.map(c=>c.group+'.'+c.action),['system.health','users.list']);
  assert.ok(!JSON.stringify(j).includes('DO_NOT_LEAK'));
 }finally{mock.restore();}
});
test('suite marks unexpected API logical error as FAIL, even if HTTP 200',async()=>{
 const mock=await fakeGAS(()=>envelope(false,null,{code:'UNAUTHENTICATED'}));
 try{
  const j=await (await worker.fetch(request('/api/run-tests',{cases:[
   {id:'S-01',operation:'users.list',payload:{limit:1},expected:{ok:true}}
  ]}),env())).json();
  assert.equal(j.passed,0);assert.equal(j.failed,1);assert.equal(j.status,'FAIL');
  assert.equal(j.results[0].observed.errorCode,'UNAUTHENTICATED');
 }finally{mock.restore();}
});
test('suite refuses write operations, payload with secrets, oversized suites',async()=>{
 const bad=[
  {cases:[{id:'S-01',operation:'users.create',payload:{},expected:{ok:true}}]},
  {cases:[{id:'S-01',operation:'users.list',payload:{sessionToken:'oops'},expected:{ok:true}}]},
  {cases:Array.from({length:11},(_,i)=>({id:'CASE-'+i,operation:'system.health',payload:{},expected:{ok:true}}))}
 ];
 for(const body of bad){
  const r=await worker.fetch(request('/api/run-tests',body),env());
  assert.equal(r.status,500);
  const j=await r.json();assert.equal(j.error,'TEST_EXECUTION_ERROR');
 }
});
test('suite enforces expected result on every test case',async()=>{
 const r=await worker.fetch(request('/api/run-tests',{cases:[{
  id:'S-01',operation:'system.health',payload:{}
 }]}),env());
 assert.equal(r.status,500);
});
