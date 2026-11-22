// Sync composite-index provisioner for the Node→live-Firestore bridge (POC #2).
// Captures the failing runQuery shape from the transport, creates the exact composite
// index via REST (SA needs roles/datastore.indexAdmin), polls until READY, retries.
// All calls are synchronous through the bridge; secrets stay in memory, never printed.
const API='https://firestore.googleapis.com/v1';
const sleepMs=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);

export function attachIndexProvisioner({bridge,projectId,databaseId,onEvent}){
  const db=databaseId||'(default)';
  const root=API+'/projects/'+projectId+'/databases/'+db;
  let auth=null;let lastQuery=null;
  const ready=new Map();const pending=new Map();
  const origFetch=bridge.fetch.bind(bridge);
  const failedPrecondition=resp=>{
    if(resp.getResponseCode()!==400)return false;
    let parsed=null;try{parsed=JSON.parse(resp.getContentText());}catch(_){return false;}
    const root=Array.isArray(parsed)?parsed.find(x=>x&&x.error):parsed;
    return !!(root&&root.error&&root.error.status==='FAILED_PRECONDITION');
  };
  bridge.fetch=(url,opts={})=>{
    if(opts.headers&&opts.headers.Authorization)auth=opts.headers.Authorization;
    if(String(url).endsWith(':runQuery')&&opts.payload){
      try{
        const q=JSON.parse(opts.payload).structuredQuery;
        const fields=[];
        const walk=w=>{if(!w)return;
          if(w.fieldFilter)fields.push(w.fieldFilter.field.fieldPath);
          if(w.compositeFilter)for(const f of w.compositeFilter.filters||[])walk(f);};
        walk(q.where);
        lastQuery={coll:q.from[0].collectionId,equals:fields,
          orderBy:(q.orderBy||[]).map(o=>({field:o.field.fieldPath,dir:o.direction}))};
      }catch(_){/* keep previous */}
    }
    let resp=origFetch(url,opts);
    // Transport-level auto-provisioning: works for ANY store instance (incl. the ones
    // Container creates per dispatch), not just a wrapped store.
    if(String(url).endsWith(':runQuery')&&failedPrecondition(resp)&&lastQuery&&lastQuery.orderBy.length){
      ensure(specOf(lastQuery));
      // Live POC #2 measured serving lag up to ~254s AFTER the index list says READY;
      // a 120s budget exhausted on cold indexes. 60×5s = 300s covers the observed worst.
      for(let i=0;i<60&&failedPrecondition(resp);i++){sleepMs(5000);resp=origFetch(url,opts);}
    }
    return resp;
  };
  function call(url,method,body){
    const opts={method,headers:{Authorization:auth},muteHttpExceptions:true};
    if(body!==undefined){opts.contentType='application/json';opts.payload=JSON.stringify(body);}
    const resp=bridge.fetch(url,opts);
    const code=resp.getResponseCode();let parsed=null;
    try{parsed=JSON.parse(resp.getContentText());}catch(_){}
    return {code,parsed};
  }
  const specOf=q=>({coll:q.coll,fields:[...q.equals.map(f=>({fieldPath:f,order:'ASCENDING'})),
    ...q.orderBy.map(o=>({fieldPath:o.field,order:o.dir==='DESCENDING'?'DESCENDING':'ASCENDING'}))]});
  const specKey=s=>s.coll+'|'+s.fields.map(f=>f.fieldPath+':'+f.order).join(',');
  // Firestore appends an implicit trailing __name__ ASC to every composite index;
  // compare only the explicit fields we asked for.
  const explicit=fields=>(fields||[]).filter(f=>f.fieldPath!=='__name__');
  const sameSpec=(a,b)=>{a=explicit(a);return a.length===b.length&&a.every((f,i)=>f.fieldPath===b[i].fieldPath&&f.order===b[i].order);};
  function waitReady(spec){
    const key=specKey(spec);
    if(ready.has(key))return;
    const deadline=Date.now()+15*60000;
    for(;;){
      const list=call(root+'/collectionGroups/'+spec.coll+'/indexes','get');
      if(list.code!==200)throw new Error('INDEX_LIST_HTTP_'+list.code);
      const mine=(list.parsed.indexes||[]).find(ix=>sameSpec(ix.fields||[],spec.fields));
      if(mine&&mine.state==='READY'){ready.set(key,mine.name);onEvent&&onEvent({type:'INDEX_READY',spec});return;}
      if(mine&&mine.state==='ERROR')throw new Error('INDEX_BUILD_ERROR');
      if(Date.now()>deadline)throw new Error('INDEX_BUILD_TIMEOUT');
      sleepMs(5000);
    }
  }
  function ensure(spec){
    const key=specKey(spec);
    if(ready.has(key))return;
    if(!auth)throw new Error('INDEX_NO_AUTH_CAPTURED');
    if(!pending.has(key)){
      const created=call(root+'/collectionGroups/'+spec.coll+'/indexes','post',{queryScope:'COLLECTION',fields:spec.fields});
      if(created.code===403||created.code===401)
        throw new Error('INDEX_PERMISSION_DENIED: grant roles/datastore.indexAdmin to the DEV service account');
      if(created.code!==200&&!(created.parsed&&created.parsed.error&&created.parsed.error.status==='ALREADY_EXISTS'))
        throw new Error('INDEX_CREATE_HTTP_'+created.code+':'+String(created.parsed&&created.parsed.error&&created.parsed.error.message||'').slice(0,160));
      pending.set(key,true);
      onEvent&&onEvent({type:'INDEX_CREATING',spec});
    }
    waitReady(spec);
    pending.delete(key);
  }
  function wrapStore(store){
    const retry=(op,args)=>{
      try{return store[op](...args);}
      catch(e){
        if(e.code!=='FAILED_PRECONDITION'||!lastQuery||!lastQuery.orderBy.length)throw e;
        ensure(specOf(lastQuery));
        // Live POC #2: the index list can report READY while the query-serving layer
        // still answers "index currently building". Retry with bounded backoff.
        let last=e;
        for(let i=0;i<60;i++){
          sleepMs(5000);
          try{return store[op](...args);}
          catch(e2){if(e2.code!=='FAILED_PRECONDITION')throw e2;last=e2;}
        }
        throw last;
      }
    };
    return Object.freeze({
      one:(...a)=>retry('one',a),list:(...a)=>retry('list',a),listNewest:(...a)=>retry('listNewest',a),
      insert:(...a)=>retry('insert',a),update:(...a)=>retry('update',a),remove:(...a)=>retry('remove',a),
      withLock:fn=>store.withLock(fn),sequence:fn=>store.sequence(fn)
    });
  }
  return {wrapStore,ensure,specOf,lastQuery:()=>lastQuery,readySpecs:()=>[...ready.keys()]};
}