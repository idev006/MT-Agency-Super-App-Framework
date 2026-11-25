// Server-side timing for ONE request (owner: "จับเวลาฝั่ง server ก่อน"). Active only when the
// caller's requestId starts with "prof_"; normal traffic is untouched. Records durations and call
// counts only — never payloads, rows, tokens or secrets.
export const PROFILE_PREFIX='prof_';
export function isProfiled(request){return !!(request&&typeof request.requestId==='string'&&request.requestId.indexOf(PROFILE_PREFIX)===0);}
export function createRequestProfiler(nowMs=()=>Date.now()){
  const t0=nowMs(),phases={},fetches=[],cache={gets:0,hits:0,puts:0,removes:0,ms:0},io={propsMs:0,driveMs:0,driveCalls:0};
  const timed=(fn,add)=>{const s=nowMs();try{return fn();}finally{add(nowMs()-s);}};
  function phase(name,fn){return timed(fn,ms=>{phases[name]=(phases[name]||0)+ms;});}
  function wrapUrlFetch(u){
    if(!u)return u;
    const w={fetch:(url,opts)=>timed(()=>u.fetch(url,opts),ms=>fetches.push({kind:kindOf(url),n:1,ms}))};
    // FIX 2026-11-25: expose fetchAll ONLY when the host has it. Cloud Run had none, so a profiled
    // request crashed on its first parallel round (OPERATION_FAILED for every prof_* request).
    if(typeof u.fetchAll==='function')w.fetchAll=reqs=>timed(()=>u.fetchAll(reqs),ms=>fetches.push({kind:'fetchAll['+reqs.map(r=>kindOf(r.url)).join(',')+']',n:reqs.length,ms}));
    return w;
  }
  function kindOf(url){const s=String(url||'');return /oauth2/.test(s)?'token':/:runAggregationQuery/.test(s)?'count':/:runQuery/.test(s)?'runQuery':/:commit/.test(s)?'commit':/:batchGet/.test(s)?'batchGet':/:beginTransaction/.test(s)?'beginTx':'other';}
  function wrapCache(c){
    if(!c)return c;
    return {
      get:k=>timed(()=>{const v=c.get(k);cache.gets++;if(v!==null&&v!==undefined)cache.hits++;return v;},ms=>{cache.ms+=ms;}),
      put:(k,v,t)=>timed(()=>{cache.puts++;return c.put(k,v,t);},ms=>{cache.ms+=ms;}),
      remove:k=>timed(()=>{cache.removes++;return c.remove(k);},ms=>{cache.ms+=ms;})
    };
  }
  function wrapProperties(p){
    if(!p)return p;
    // Explicit delegation: GAS service objects expose methods that object spread does not copy.
    return {getScriptProperties:()=>{const sp=p.getScriptProperties();return {
      getProperties:()=>timed(()=>sp.getProperties(),ms=>{io.propsMs+=ms;}),
      getProperty:k=>timed(()=>sp.getProperty(k),ms=>{io.propsMs+=ms;}),
      setProperty:(k,v)=>sp.setProperty(k,v),deleteProperty:k=>sp.deleteProperty(k)};}};
  }
  function wrapDrivePhotos(d){
    if(!d)return d;
    const w=name=>(...args)=>timed(()=>{io.driveCalls++;return d[name](...args);},ms=>{io.driveMs+=ms;});
    return {upload:w('upload'),read:w('read'),trash:w('trash')};
  }
  function report(){
    const fetchMs=fetches.reduce((a,f)=>a+f.ms,0);
    return {totalMs:nowMs()-t0,phases,fetch:{rounds:fetches.length,requests:fetches.reduce((a,f)=>a+f.n,0),ms:fetchMs,calls:fetches},cache,io};
  }
  return {phase,wrapUrlFetch,wrapCache,wrapProperties,wrapDrivePhotos,report};
}
