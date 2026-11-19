// Live public-URL smoke, non-sensitive. No credentials, vehicle, phone, QR token or Drive data.
import assert from 'node:assert/strict';

const url=process.env.P6VC_GAS_EXEC_URL;
if(!url || !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url))
 throw new Error('P6VC_GAS_EXEC_URL is missing or invalid');
const timeoutMs=15000;
const msg=(group,action,payload={},extra={})=>({apiVersion:'v1',group,action,payload,...extra});
async function request(name,{method='GET',body}={}){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const r=await fetch(url,{method,redirect:'follow',signal:controller.signal,
   ...(body!==undefined?{headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body)}:{})});
  const raw=await r.text();
  let data;
  try{data=JSON.parse(raw);}
  catch{throw Error(name+': non-JSON response, HTTP '+r.status+'; host '+new URL(r.url).hostname);}
  if(!data||typeof data!=='object'||typeof data.ok!=='boolean')throw Error(name+': missing JSON API envelope');
  console.log(name+': HTTP '+r.status+', ok='+data.ok+', code='+(data.error?.code||'none'));
  return {http:r.status,data};
 }finally{clearTimeout(timeout);}
}

const checks=[
 ['LIVE-01 GET_HEALTH',{},true,null,'ready'],
 ['LIVE-02 POST_HEALTH',{method:'POST',body:msg('system','health')},true,null,'ready'],
 ['LIVE-03 POST_BAD_VERSION',{method:'POST',body:msg('system','health',{}, {apiVersion:'v9'})},false,'BAD_REQUEST'],
 ['LIVE-04 POST_BAD_PAYLOAD',{method:'POST',body:msg('system','health',[])},false,'BAD_REQUEST'],
 ['LIVE-05 POST_UNKNOWN_ROUTE',{method:'POST',body:msg('unknown','read')},false,'NOT_FOUND'],
 ['LIVE-06 POST_PROTO_GROUP',{method:'POST',body:msg('__proto__','constructor')},false,'BAD_REQUEST'],
 ['LIVE-07 POST_LOOKUP_DENIED',{method:'POST',body:msg('vehicles','lookup',{plate:'TEST0000',province:'TEST'})},false,'UNAUTHENTICATED'],
 ['LIVE-08 POST_CONTACT_DENIED',{method:'POST',body:msg('contacts','read',{vehicleId:'synthetic-vehicle'})},false,'UNAUTHENTICATED'],
 ['LIVE-09 POST_QR_DENIED',{method:'POST',body:msg('qr','resolve',{token:'0'.repeat(64)})},false,'UNAUTHENTICATED'],
 ['LIVE-10 POST_LOGIN_INVALID',{method:'POST',body:msg('auth','login',{})},false,'INVALID_REQUEST'],
 ['LIVE-11 POST_HEALTH_CORRELATION',{method:'POST',body:msg('system','health',{}, {requestId:'safeTestCorrelation01'})},true,null,'ready','safeTestCorrelation01']
];
let pass=0,failed=0;
for(const [name,options,expectedOk,expectedCode,expectedStatus,expectedId=null]of checks){
 try{
  const {http,data}=await request(name,options);
  assert.equal(http,200,'expected HTTP 200 (GAS ContentService JSON)');
  assert.equal(data.ok,expectedOk,'API ok value');
  if(expectedCode)assert.equal(data.error?.code,expectedCode,'API logical error code');
  if(expectedStatus)assert.equal(data.data?.status,expectedStatus,'health status');
  assert.equal(data.requestId,expectedId,'request correlation');
  pass++;console.log('PASS: '+name);
 }catch(e){
  failed++;console.error('FAIL: '+name+' ('+String(e.message).slice(0,220)+')');
 }
}
console.log('RESULT: '+pass+'/'+checks.length+' passed; 0 credential/PII/business-data payloads submitted');
if(failed){
 console.error('Check whether published /exec deployment is still on an older version. A source push is not Web App publication.');
 process.exitCode=1;
}
