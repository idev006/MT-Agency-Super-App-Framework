import assert from 'node:assert/strict';

const url=process.env.P6VC_GAS_EXEC_URL;
if(!url || !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url)) {
  throw new Error('P6VC_GAS_EXEC_URL is missing or invalid');
}
const timeoutMs=15000;
async function request(name,{method='GET',body}={}) {
  const controller=new AbortController();
  const t=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const r=await fetch(url,{
      method,redirect:'follow',signal:controller.signal,
      ...(body!==undefined?{headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body)}:{})
    });
    const raw=await r.text();
    let data;
    try {data=JSON.parse(raw)} catch {
      throw new Error(name+': response not JSON, HTTP '+r.status+'; final host '+new URL(r.url).hostname);
    }
    if(!data || typeof data!=='object' || typeof data.ok!=='boolean')throw Error(name+': invalid response envelope');
    console.log(name+': HTTP '+r.status+', ok='+data.ok+', code='+(data.error?.code||'none'));
    return {http:r.status,data};
  } finally {clearTimeout(t);}
}

const checks=[
  {name:'GET_HEALTH',run:()=>request('GET_HEALTH'),expect:{ok:true,status:'bootstrap'}},
  {name:'POST_HEALTH',run:()=>request('POST_HEALTH',{method:'POST',body:{apiVersion:'v1',group:'system',action:'health',payload:{}}}),expect:{ok:true,status:'bootstrap'}},
  {name:'POST_VERSION_REJECT',run:()=>request('POST_VERSION_REJECT',{method:'POST',body:{apiVersion:'v9',group:'system',action:'health',payload:{}}}),expect:{ok:false,code:'BAD_REQUEST'}},
  {name:'POST_UNKNOWN_GROUP',run:()=>request('POST_UNKNOWN_GROUP',{method:'POST',body:{apiVersion:'v1',group:'other',action:'read',payload:{}}}),expect:{ok:false,code:'NOT_FOUND'}},
  {name:'POST_PROTECTED_LOOKUP_DENY',run:()=>request('POST_PROTECTED_LOOKUP_DENY',{method:'POST',body:{apiVersion:'v1',group:'vehicles',action:'lookup',payload:{role:'admin'}}}),expect:{ok:false,code:'NOT_FOUND'}},
  {name:'POST_PROTECTED_CONTACT_DENY',run:()=>request('POST_PROTECTED_CONTACT_DENY',{method:'POST',body:{apiVersion:'v1',group:'contacts',action:'read',payload:{role:'admin'}}}),expect:{ok:false,code:'NOT_FOUND'}},
  {name:'POST_PROTECTED_QR_DENY',run:()=>request('POST_PROTECTED_QR_DENY',{method:'POST',body:{apiVersion:'v1',group:'qr',action:'resolve',payload:{}}}),expect:{ok:false,code:'NOT_FOUND'}}
];
let failures=0;
for(const check of checks) {
  try {
    const result=await check.run();
    assert.equal(result.data.ok,check.expect.ok);
    if(check.expect.status)assert.equal(result.data.data?.status,check.expect.status);
    if(check.expect.code)assert.equal(result.data.error?.code,check.expect.code);
    assert.equal(result.data.requestId,null);
    console.log('PASS: '+check.name);
  }catch(e){
    failures++;
    console.error('FAIL: '+check.name+' ('+String(e.message).slice(0,280)+')');
  }
}
console.log('RESULT: '+(checks.length-failures)+'/'+checks.length+' passed; no PII payload used');
if(failures)process.exitCode=1;
