// Manual-only, non-sensitive P6VC login acceptance against owner-approved GAS + Sheets.
// Requires username (operator input) and password (GitHub Actions repository secret).
// Never print credentials, tokens, server response bodies, or record identifiers.
import assert from 'node:assert/strict';

const url=process.env.P6VC_GAS_EXEC_URL;
const username=process.env.P6VC_HTTP_LOGIN_USERNAME;
const password=process.env.P6VC_HTTP_LOGIN_PASSWORD;
const expectedPasswordState=process.env.P6VC_EXPECT_PASSWORD_STATE;
if(!url||!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url))throw Error('INVALID_TARGET_URL');
if(!username||username.length>100||!password||password.length<12)throw Error('MISSING_APPROVED_LOGIN_SECRET_OR_USERNAME');
if(!['changed','initial'].includes(expectedPasswordState))throw Error('INVALID_EXPECTED_PASSWORD_STATE');
const results=[];
function done(id,start,passed,details=''){
 const row={id,status:passed?'PASS':'FAIL',durationMs:Date.now()-start,details};results.push(row);
 console.log(`${row.status} ${id} ${row.durationMs}ms${details?' '+details:''}`);
}
async function api(group,action,payload={},token=null){
 const body={apiVersion:'v1',group,action,payload,...(token?{sessionToken:token}:{})};
 const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},redirect:'follow',body:JSON.stringify(body),signal:AbortSignal.timeout(40000)});
 const response=await r.text();let json;
 try{json=JSON.parse(response);}catch{throw Error('NON_JSON_HTTP_'+r.status)}
 if(typeof json?.ok!=='boolean'||!Object.hasOwn(json,'error')||!Object.hasOwn(json,'data'))throw Error('MALFORMED_ENVELOPE');
 assert.equal(r.status,200,'UNEXPECTED_HTTP_STATUS');return json;
}
async function check(id,fn){const start=Date.now();try{const detail=await fn();done(id,start,true,detail||'');return true;}catch(e){done(id,start,false,String(e.message||'TEST_FAILURE').slice(0,70));return false;}}
function denied(j,code){assert.equal(j.ok,false,'UNEXPECTED_SUCCESS');assert.equal(j.error?.code,code,'UNEXPECTED_ERROR_CODE')}
let token=null,loggedIn=false;
try{
 await check('LOGIN-01.HEALTH',async()=>{const j=await api('system','health');assert.equal(j.ok,true);assert.equal(j.data?.status,'ready');assert.equal(j.data?.apiVersion,'v1');assert.match(j.data?.backendVersion,/^\d+\.\d+\.\d+$/);});
 await check('LOGIN-02.INVALID_EMPTY_PAYLOAD',async()=>denied(await api('auth','login',{}),'INVALID_REQUEST'));
 await check('LOGIN-03.UNAUTHENTICATED_SESSION',async()=>denied(await api('auth','session'), 'UNAUTHENTICATED'));
 const ok=await check('LOGIN-04.VALID_CREDENTIALS',async()=>{
  const j=await api('auth','login',{username,password});assert.equal(j.ok,true,'LOGIN_DENIED_'+(j.error?.code||'UNKNOWN'));
  assert.match(j.data?.sessionToken||'',/^[0-9a-f]{64}$/i);token=j.data.sessionToken;loggedIn=true;
  return 'login=accepted; secret/session redacted';
 });
 if(ok){
  await check('LOGIN-05.SESSION_AND_ROLE',async()=>{
   const j=await api('auth','session',{},token);assert.equal(j.ok,true,'SESSION_DENIED_'+(j.error?.code||'UNKNOWN'));
   assert.ok(Array.isArray(j.data?.roles)&&j.data.roles.includes('SYSTEM_ADMIN'),'MISSING_EXPECTED_ROLE');
   return 'role=SYSTEM_ADMIN; userId redacted';
  });
  await check('LOGIN-06.PASSWORD_CHANGE_POLICY',async()=>{
   const j=await api('auth','session',{},token);assert.equal(j.ok,true);
   const expectedMustChange=expectedPasswordState==='initial';
   assert.equal(j.data?.mustChangePassword,expectedMustChange,'PASSWORD_CHANGE_STATE_MISMATCH');
   if(!expectedMustChange)assert.ok(Array.isArray(j.data?.permissions)&&j.data.permissions.length>0,'ACTIVE_PERMISSIONS_MISSING');
   return `passwordState=${expectedPasswordState}; permissions=${expectedMustChange?'withheld':'active'}`;
  });
 }
}finally{
 if(loggedIn&&token){
  const loggedOut=await check('LOGIN-07.LOGOUT',async()=>{
   const j=await api('auth','logout',{},token);assert.equal(j.ok,true,'LOGOUT_DENIED_'+(j.error?.code||'UNKNOWN'));
   assert.equal(j.data?.revoked,true);return 'revoked=true';
  });
  if(loggedOut)await check('LOGIN-08.REVOKED_SESSION_DENIAL',async()=>denied(await api('auth','session',{},token),'UNAUTHENTICATED'));
 }
 const failed=results.filter(x=>x.status==='FAIL').length;
 const status=failed?'FAIL':loggedIn?'PASS':'BLOCKED';
 console.log(`FINAL ${JSON.stringify({status,pass:results.filter(x=>x.status==='PASS').length,failed,executed:results.length,mode:'approved-single-admin-login-no-business-writes'})}`);
 if(failed||!loggedIn)process.exitCode=1;
}
