// Synchronous fetch for Node (the business code follows the GAS UrlFetchApp contract, which is
// synchronous). A worker thread performs the real fetch; the caller blocks on Atomics.wait.
// Shared by the Cloud Run runtime and the DEV scripts. One request at a time per process:
// Cloud Run runs this service with concurrency=1 and scales out instances.
// fetchAll (FIX 2026-11-25): the GAS UrlFetchApp.fetchAll contract — independent requests run IN
// PARALLEL in the worker (Promise.all) and return in order. Without it every "one parallel round"
// of the application (session check, Vehicle 360, window + COUNT) ran one request at a time.
import {Worker} from 'node:worker_threads';

const BUF_BYTES=32*1024*1024;
const WORKER_SOURCE=`
const {workerData}=require('worker_threads');
// Keep the worker event loop alive so Atomics.waitAsync notifications are delivered
// even when no sockets/timers are pending (observed: 2nd call hangs without this).
setInterval(()=>{},1000);
const ctrl=new Int32Array(workerData.sab,0,4);
const buf=new Uint8Array(workerData.sab,16);
const decoder=new TextDecoder();const encoder=new TextEncoder();
async function loop(){
  for(;;){
    const w=Atomics.waitAsync(ctrl,0,0);
    if(w.async)await w.value;
    const state=Atomics.load(ctrl,0);
    if(state===9)return;
    if(state!==1)continue;
    const req=JSON.parse(decoder.decode(buf.subarray(0,ctrl[1])));
    const one=async r=>{
      try{const resp=await fetch(r.url,{method:r.method,headers:r.headers,body:r.body});return {code:resp.status,text:await resp.text()};}
      catch(e){return {code:0,text:String(e&&e.message||e)};}
    };
    const res=Array.isArray(req.many)?{many:await Promise.all(req.many.map(one))}:await one(req);
    const bytes=encoder.encode(JSON.stringify(res));
    if(bytes.length>buf.length){
      const err=encoder.encode(JSON.stringify({code:0,text:'BRIDGE_BUFFER_OVERFLOW'}));
      buf.set(err);ctrl[2]=err.length;
    }else{buf.set(bytes);ctrl[2]=bytes.length;}
    Atomics.store(ctrl,0,2);Atomics.notify(ctrl,0);
    const w2=Atomics.waitAsync(ctrl,0,2);
    if(w2.async)await w2.value;
  }
}
loop().catch(e=>{
  const err=new TextEncoder().encode(JSON.stringify({code:0,text:'BRIDGE_WORKER_CRASH '+String(e&&e.message||e)}));
  buf.set(err);ctrl[2]=err.length;
  Atomics.store(ctrl,0,2);Atomics.notify(ctrl,0);
});
`;

export function createSyncFetch(){
  const sab=new SharedArrayBuffer(BUF_BYTES);
  const ctrl=new Int32Array(sab,0,4);
  const buf=new Uint8Array(sab,16);
  const decoder=new TextDecoder();const encoder=new TextEncoder();
  const worker=new Worker(WORKER_SOURCE,{eval:true,workerData:{sab}});
  const state={calls:0,bytesIn:0,bytesOut:0};
  // If the worker dies while the main thread is blocked in Atomics.wait, wake it with
  // an error response instead of hanging until the 120s timeout.
  let dead=null;
  function wakeWithFailure(reason){
    if(dead)return;dead=reason;
    const err=encoder.encode(JSON.stringify({code:0,text:'BRIDGE_WORKER_DEAD '+reason}));
    buf.set(err);ctrl[2]=err.length;
    Atomics.store(ctrl,0,2);Atomics.notify(ctrl,0);
  }
  let closing=false;
  worker.on('error',e=>{console.error('BRIDGE_WORKER_ERROR '+String(e&&e.message||e));wakeWithFailure(String(e&&e.message||e));});
  worker.on('exit',c=>{if(!closing){console.error('BRIDGE_WORKER_EXIT code='+c);wakeWithFailure('exit code '+c);}});
  function toReq(url,opts={}){
    const req={url,method:(opts.method||'get').toUpperCase(),headers:opts.headers||{},
      body:opts.payload!==undefined?String(opts.payload):undefined};
    if(opts.contentType)req.headers=({...req.headers,'Content-Type':opts.contentType});
    return req;
  }
  const asResponse=res=>({getResponseCode:()=>res.code,getContentText:()=>res.text});
  // One blocking round-trip to the worker; returns the parsed reply.
  function exchange(payload){
    if(dead)throw new Error('BRIDGE_WORKER_DEAD '+dead);
    const bytes=encoder.encode(JSON.stringify(payload));
    if(bytes.length>buf.length)throw new Error('BRIDGE_REQUEST_TOO_LARGE');
    buf.set(bytes);ctrl[1]=bytes.length;state.bytesOut+=bytes.length;
    Atomics.store(ctrl,0,1);Atomics.notify(ctrl,0);
    const waited=Atomics.wait(ctrl,0,1,120000);
    if(waited==='timed-out')throw new Error('BRIDGE_FETCH_TIMEOUT');
    const res=JSON.parse(decoder.decode(buf.subarray(0,ctrl[2])));
    state.bytesIn+=ctrl[2];
    Atomics.store(ctrl,0,0);Atomics.notify(ctrl,0);
    return res;
  }
  function fetchSync(url,opts={}){
    const res=exchange(toReq(url,opts));state.calls++;
    return asResponse(res);
  }
  // GAS UrlFetchApp.fetchAll: [{url,...opts}] -> responses in the same order, fetched in parallel.
  function fetchAll(reqs){
    if(!reqs.length)return [];
    const res=exchange({many:reqs.map(({url,...opts})=>toReq(url,opts))});
    state.calls+=reqs.length;state.rounds=(state.rounds||0)+1;
    // a worker failure answers with a single error object: fail every request of the round
    return Array.isArray(res.many)?res.many.map(asResponse):reqs.map(()=>asResponse(res));
  }
  function close(){closing=true;Atomics.store(ctrl,0,9);Atomics.notify(ctrl,0);worker.terminate();}
  return {fetch:fetchSync,fetchAll,close,state};
}

