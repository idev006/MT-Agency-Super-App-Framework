// F3a: the REAL GAS Firestore gateway behind the F2 adapter's document-gateway port
// (query + runTransaction; tx.get/create/update/delete/query). Production transport is
// Firestore REST v1 over UrlFetchApp with service-account RS256 JWT OAuth — the path
// proven live by POC #1 run #2 (PASS 8/8). Contract rules from the live-run-#1 incident
// (FIRESTORE_REST_LIVE_POC_INCIDENT_20261122.md): verb-on-parent URLs (:runQuery /
// :beginTransaction / :commit / :batchGet / :rollback on /documents), RELATIVE resource
// names in bodies, never order-sensitive compare of returned maps.
// Transactions keep a local write overlay so reads see their own writes (mirrors the F2
// fake), then commit ALL writes atomically with existence preconditions; a throw rolls
// back server-side. where+orderBy(_seq) needs per-collection composite indexes live
// (provisioned at cutover, POC #2); the gateway surfaces FAILED_PRECONDITION untouched.
// GAS-compatible: no Node/SDK API; Utilities + UrlFetchApp injected. Secrets (PEM, token)
// never logged, returned or embedded in error messages.
const TOKEN_URL='https://oauth2.googleapis.com/token';
const DATASTORE_SCOPE='https://www.googleapis.com/auth/datastore';
const TOKEN_REFRESH_MARGIN_SECONDS=60;

export function createFirestoreRestGateway({utilities,urlFetchApp,clientEmail,privateKey,projectId,databaseId,clock,tokenCache=null}){
  if(typeof clientEmail!=='string'||!clientEmail.includes('@'))throw new Error('INVALID_CLIENT_EMAIL');
  if(typeof privateKey!=='string'||!privateKey.includes('BEGIN PRIVATE KEY'))throw new Error('INVALID_PRIVATE_KEY');
  if(typeof projectId!=='string'||!projectId)throw new Error('INVALID_PROJECT_ID');
  const db=databaseId||'(default)';
  const base='https://firestore.googleapis.com/v1/projects/'+projectId+'/databases/'+db+'/documents';
  const relName=(coll,id)=>'projects/'+projectId+'/databases/'+db+'/documents/'+coll+'/'+id;
  const idOf=name=>String(name).split('/').pop();
  const nowSeconds=()=>Math.floor((clock?Date.parse(clock()):Date.now())/1000);
  const b64url=data=>utilities.base64EncodeWebSafe(data).replace(/=+$/,'');

  function encodeValue(v){
    if(v===null||v===undefined)return {nullValue:null};
    if(typeof v==='string')return {stringValue:v};
    if(typeof v==='boolean')return {booleanValue:v};
    if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
    // T2-2: Date = a real Firestore timestamp (TTL policies only act on timestamp fields).
    if(v instanceof Date)return {timestampValue:v.toISOString()};
    if(Array.isArray(v))return {arrayValue:{values:v.map(encodeValue)}};
    if(typeof v==='object')return {mapValue:{fields:encodeFields(v)}};
    throw new Error('UNSUPPORTED_VALUE_TYPE');
  }
  function decodeValue(v){
    if('stringValue' in v)return v.stringValue;
    if('integerValue' in v)return Number(v.integerValue);
    if('doubleValue' in v)return v.doubleValue;
    if('booleanValue' in v)return v.booleanValue;
    if('nullValue' in v)return null;
    if('timestampValue' in v)return new Date(v.timestampValue); // round-trips as a timestamp (T2-2)
    if('arrayValue' in v)return (v.arrayValue.values||[]).map(decodeValue);
    if('mapValue' in v)return decodeFields(v.mapValue.fields);
    throw new Error('UNSUPPORTED_VALUE_TYPE');
  }
  function encodeFields(obj){const out={};for(const k of Object.keys(obj))out[k]=encodeValue(obj[k]);return out;}
  function decodeFields(fields){const out={};for(const k of Object.keys(fields||{}))out[k]=decodeValue(fields[k]);return out;}

  // Speed (owner: "ระบบช้ามาก"): each GAS web request is a new execution, so the in-memory token
  // was re-minted (RSA sign + token exchange round trip) on EVERY API call. When a shared
  // tokenCache (GAS script CacheService) is injected, the access token is reused across
  // executions until its own expiry margin. The cache is private to this script project.
  let cached=null;
  const CACHE_KEY='p6vc:fs-token:'+clientEmail;
  function token(){
    if(cached&&nowSeconds()<cached.expiresAt)return cached.token;
    if(tokenCache){
      try{const hit=JSON.parse(tokenCache.get(CACHE_KEY)||'null');
        if(hit&&typeof hit.token==='string'&&nowSeconds()<hit.expiresAt){cached=hit;return cached.token;}}catch(_){/* refetch */}
    }
    const iat=nowSeconds();
    const signingInput=b64url(JSON.stringify({alg:'RS256',typ:'JWT'}))+'.'+b64url(JSON.stringify({
      iss:clientEmail,scope:DATASTORE_SCOPE,aud:TOKEN_URL,iat,exp:iat+3600}));
    const jwt=signingInput+'.'+b64url(utilities.computeRsaSha256Signature(signingInput,privateKey));
    const resp=urlFetchApp.fetch(TOKEN_URL,{method:'post',contentType:'application/x-www-form-urlencoded',
      payload:'grant_type='+encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')+'&assertion='+encodeURIComponent(jwt),
      muteHttpExceptions:true});
    if(resp.getResponseCode()!==200)throw new Error('TOKEN_EXCHANGE_HTTP_'+resp.getResponseCode());
    const body=JSON.parse(resp.getContentText());
    if(typeof body.access_token!=='string'||!body.access_token)throw new Error('NO_ACCESS_TOKEN');
    cached={token:body.access_token,expiresAt:iat+(Number(body.expires_in)||3600)-TOKEN_REFRESH_MARGIN_SECONDS};
    if(tokenCache){try{tokenCache.put(CACHE_KEY,JSON.stringify(cached),Math.max(60,Math.min(21600,cached.expiresAt-nowSeconds())));}catch(_){/* cache optional */}}
    return cached.token;
  }

  function request(url,method,body){
    const opts={url,method,headers:{Authorization:'Bearer '+token()},muteHttpExceptions:true};
    if(body!==undefined){opts.contentType='application/json';opts.payload=JSON.stringify(body);}
    return opts;
  }
  // A cached token that Firestore rejects (401) is dropped and the call retried once with a fresh one.
  function dropToken(){cached=null;if(tokenCache){try{tokenCache.remove(CACHE_KEY);}catch(_){}}}
  function call(url,method,body){
    const {url:_u,...opts}=request(url,method,body);
    const resp=urlFetchApp.fetch(url,opts);
    if(tokenCache&&resp.getResponseCode()===401){dropToken();const {url:_r,...again}=request(url,method,body);return parse(urlFetchApp.fetch(url,again));}
    return parse(resp);
  }
  // Independent requests in ONE wall-clock round (UrlFetchApp.fetchAll runs them in
  // parallel). Falls back to sequential fetch where the transport has no fetchAll.
  function callMany(reqs){
    if(!reqs.length)return [];
    const built=reqs.map(r=>request(r.url,r.method,r.body));
    if(typeof urlFetchApp.fetchAll!=='function')
      return built.map(({url,...opts})=>parse(urlFetchApp.fetch(url,opts)));
    return urlFetchApp.fetchAll(built).map(parse);
  }
  function parse(resp){
    const code=resp.getResponseCode(),text=resp.getContentText();
    let parsed=null;try{parsed=text?JSON.parse(text):null;}catch(_){parsed=null;}
    if(code<200||code>=300){
      // Live contract (POC #2): :runQuery streams errors as [{error:{...}}], while
      // :commit/:batchGet/etc return {error:{...}}. Normalize both shapes.
      const errRoot=Array.isArray(parsed)?parsed.find(x=>x&&x.error):parsed;
      const status=errRoot&&errRoot.error&&errRoot.error.status;
      throw Object.assign(new Error('FIRESTORE_'+(status||'HTTP_'+code)),{code:status||'HTTP_'+code,httpStatus:code});
    }
    return parsed;
  }

  function whereClause(where){
    const filters=(where||[]).map(w=>({fieldFilter:{field:{fieldPath:w.field},op:'EQUAL',value:encodeValue(w.value)}}));
    if(!filters.length)return undefined;
    return filters.length===1?filters[0]:{compositeFilter:{op:'AND',filters}};
  }
  function queryBody(coll,{where=[],orderBy,limit}={},txId){
    const structuredQuery={from:[{collectionId:coll}]};
    const w=whereClause(where);if(w)structuredQuery.where=w;
    if(orderBy)structuredQuery.orderBy=[{field:{fieldPath:orderBy.field},direction:orderBy.direction==='desc'?'DESCENDING':'ASCENDING'}];
    if(limit!==undefined)structuredQuery.limit=limit;
    const body={structuredQuery};if(txId)body.transaction=txId;
    return body;
  }
  // updateTime = the document's server version (used for optimistic-concurrency preconditions).
  const queryRows=rows=>(Array.isArray(rows)?rows:[]).filter(r=>r.document).map(r=>({id:idOf(r.document.name),fields:decodeFields(r.document.fields),updateTime:r.document.updateTime||null}));
  function query(coll,opts={},txId){
    return queryRows(call(base+':runQuery','post',queryBody(coll,opts,txId)));
  }
  // Non-transactional independent queries in one parallel round. specs: [{coll,where,orderBy,limit}].
  // TUNEUP R1: a spec with count:true is a COUNT aggregation (billed ~1 read per 1,000 index
  // entries) instead of reading the documents; it returns a number in the same parallel round.
  function aggregateBody(coll,{where=[]}={}){
    const structuredQuery={from:[{collectionId:coll}]};
    const w=whereClause(where);if(w)structuredQuery.where=w;
    return {structuredAggregationQuery:{structuredQuery,aggregations:[{alias:'n',count:{}}]}};
  }
  const countOf=rows=>{const r=(Array.isArray(rows)?rows:[]).find(x=>x&&x.result);return Number(r&&r.result.aggregateFields&&r.result.aggregateFields.n&&r.result.aggregateFields.n.integerValue||0);};
  function queryMany(specs){
    return callMany(specs.map(s=>s.count?{url:base+':runAggregationQuery',method:'post',body:aggregateBody(s.coll,s)}
      :{url:base+':runQuery',method:'post',body:queryBody(s.coll,s)})).map((rows,i)=>specs[i].count?countOf(rows):queryRows(rows));
  }
  function count(coll,opts={}){return countOf(call(base+':runAggregationQuery','post',aggregateBody(coll,opts)));}
  // txId: read inside an existing transaction. beginNew: start a read-write transaction IN
  // this same request (Firestore newTransaction) — saves the separate :beginTransaction round;
  // the started transaction id comes back on the response stream and is returned as .txId.
  function batchGetNames(names,txId,beginNew){
    const body={documents:names};
    if(txId)body.transaction=txId;
    else if(beginNew)body.newTransaction={readWrite:{}};
    const rows=call(base+':batchGet','post',body);
    const out=new Map();
    for(const r of Array.isArray(rows)?rows:[]){
      if(r.transaction&&!out.txId)out.txId=r.transaction;
      if(r.found)out.set(r.found.name,decodeFields(r.found.fields));
      else if(r.missing)out.set(r.missing,null);
    }
    return out;
  }
  function batchGet(coll,ids,txId){
    const m=batchGetNames(ids.map(id=>relName(coll,id)),txId);
    const out=new Map();
    for(const id of ids){const n=relName(coll,id);out.set(id,m.has(n)?m.get(n):null);}
    return out;
  }
  // Non-transactional single-round-trip write. Ops are {type:'create'|'update'|'delete',
  // coll,id,fields}; existence preconditions (currentDocument.exists) keep each write
  // atomic without begin+commit. Mirrors runTransaction's commit write shape.
  // type 'patch' writes ONLY the given fields (updateMask) on an existing doc — no read,
  // and concurrent writes to other fields (e.g. a session revoke) are never overwritten.
  const FIELD_PATH=/^[A-Za-z_][A-Za-z0-9_]*$/;
  function commitBody(ops){
    const writes=ops.map(o=>{
      if(o.type==='delete')return {delete:relName(o.coll,o.id),currentDocument:{exists:true}};
      if(o.type==='patch'){
        const paths=Object.keys(o.fields||{});
        if(!paths.length||paths.some(p=>!FIELD_PATH.test(p)))throw new Error('INVALID_PATCH');
        // ifUpdateTime: optimistic concurrency — the write applies only if nobody changed the
        // document since it was read (Firestore returns FAILED_PRECONDITION otherwise).
        return {update:{name:relName(o.coll,o.id),fields:encodeFields(o.fields)},updateMask:{fieldPaths:paths},
          currentDocument:o.ifUpdateTime?{updateTime:o.ifUpdateTime}:{exists:true}};
      }
      return {update:{name:relName(o.coll,o.id),fields:encodeFields(o.fields)},currentDocument:{exists:o.type==='create'?false:true}};
    });
    return {writes};
  }
  function commit(ops){return call(base+':commit','post',commitBody(ops));}
  // Speed: independent queries AND one independent commit in the SAME parallel round (fetchAll),
  // e.g. a read view plus its append-only access-audit row. Returns [queryRows..., commitResult].
  function queryManyAndCommit(specs,ops){
    const reqs=specs.map(s=>({url:base+':runQuery',method:'post',body:queryBody(s.coll,s)}));
    reqs.push({url:base+':commit',method:'post',body:commitBody(ops)});
    const out=callMany(reqs);
    return [...out.slice(0,specs.length).map(queryRows),out[specs.length]];
  }
  function batchGetMany(coll,ids){return batchGet(coll,ids);}

  function runTransaction(fn,prefetch){
    const pending=new Map();
    const key=(coll,id)=>coll+'/'+id;
    // Prefetch folds the tx's initial reads (e.g. doc + sequence counter) into ONE batchGet
    // that ALSO begins the transaction (newTransaction): insert = 2 round-trips (was 3; 4
    // before 0.9.3). Without prefetch the tx is begun explicitly as before.
    const seeded=new Map();
    let txId;
    if(prefetch&&prefetch.length){
      const m=batchGetNames(prefetch.map(p=>relName(p.coll,p.id)),null,true);
      txId=m.txId;
      for(const p of prefetch){const n=relName(p.coll,p.id);seeded.set(key(p.coll,p.id),m.has(n)?m.get(n):null);}
    }else{
      const begin=call(base+':beginTransaction','post',{options:{readWrite:{}}});
      txId=begin&&begin.transaction;
    }
    if(!txId)throw new Error('NO_TRANSACTION_ID');
    const serverGet=(coll,id)=>{const k=key(coll,id);if(seeded.has(k))return seeded.get(k);const m=batchGet(coll,[id],txId);return m.has(id)?m.get(id):null;};
    const tx={
      get(coll,id){
        const p=pending.get(key(coll,id));
        if(p)return p.type==='delete'?null:{...p.fields};
        const f=serverGet(coll,id);return f?{...f}:null;
      },
      create(coll,id,fields){
        const p=pending.get(key(coll,id));
        if(p&&p.type!=='delete')throw Object.assign(new Error('ALREADY_EXISTS'),{code:'ALREADY_EXISTS'});
        if(!p&&serverGet(coll,id))throw Object.assign(new Error('ALREADY_EXISTS'),{code:'ALREADY_EXISTS'});
        pending.set(key(coll,id),{type:'create',coll,id,fields:{...fields}});
        return id;
      },
      update(coll,id,fields){
        const current=tx.get(coll,id);
        if(!current)throw Object.assign(new Error('NOT_FOUND'),{code:'NOT_FOUND'});
        const p=pending.get(key(coll,id));
        const merged={...current,...fields};
        pending.set(key(coll,id),{type:p&&p.type==='create'?'create':'update',coll,id,fields:merged});
      },
      delete(coll,id){
        if(!tx.get(coll,id))throw Object.assign(new Error('NOT_FOUND'),{code:'NOT_FOUND'});
        const p=pending.get(key(coll,id));
        // Created AND deleted in this tx: net no-op. A delete write with exists:true would
        // 404 because the create never reached the server.
        if(p&&p.type==='create')pending.delete(key(coll,id));
        else pending.set(key(coll,id),{type:'delete',coll,id});
      },
      query(coll,opts={}){
        const rows=query(coll,{...opts,limit:undefined},txId);
        const byId=new Map(rows.map(r=>[r.id,r]));
        for(const p of pending.values()){
          if(p.coll!==coll)continue;
          if(p.type==='delete')byId.delete(p.id);
          else byId.set(p.id,{id:p.id,fields:{...p.fields}});
        }
        let docs=[...byId.values()];
        for(const w of opts.where||[])docs=docs.filter(d=>d.fields[w.field]===w.value);
        if(opts.orderBy){
          const f=opts.orderBy.field,dir=opts.orderBy.direction==='desc'?-1:1;
          docs.sort((a,b)=>{const av=a.fields[f],bv=b.fields[f];return (av<bv?-1:av>bv?1:0)*dir;});
        }
        if(opts.limit!==undefined)docs=docs.slice(0,opts.limit);
        return docs.map(d=>({id:d.id,fields:{...d.fields}}));
      },
      runTransaction(nested){return nested(tx);}
    };
    let result;
    try{result=fn(tx);}
    catch(e){
      try{call(base+':rollback','post',{transaction:txId});}catch(_){/* best effort */}
      throw e;
    }
    const writes=[];
    for(const p of pending.values()){
      if(p.type==='delete')writes.push({delete:relName(p.coll,p.id),currentDocument:{exists:true}});
      else writes.push({update:{name:relName(p.coll,p.id),fields:encodeFields(p.fields)},
        currentDocument:{exists:p.type==='create'?false:true}});
    }
    call(base+':commit','post',{transaction:txId,writes});
    return result;
  }

  return Object.freeze({query,queryMany,queryManyAndCommit,runTransaction,commit,batchGetMany,count});
}