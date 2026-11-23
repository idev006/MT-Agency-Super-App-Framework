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

export function createFirestoreRestGateway({utilities,urlFetchApp,clientEmail,privateKey,projectId,databaseId,clock}){
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
    if('timestampValue' in v)return v.timestampValue;
    if('arrayValue' in v)return (v.arrayValue.values||[]).map(decodeValue);
    if('mapValue' in v)return decodeFields(v.mapValue.fields);
    throw new Error('UNSUPPORTED_VALUE_TYPE');
  }
  function encodeFields(obj){const out={};for(const k of Object.keys(obj))out[k]=encodeValue(obj[k]);return out;}
  function decodeFields(fields){const out={};for(const k of Object.keys(fields||{}))out[k]=decodeValue(fields[k]);return out;}

  let cached=null;
  function token(){
    if(cached&&nowSeconds()<cached.expiresAt)return cached.token;
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
    return cached.token;
  }

  function call(url,method,body){
    const opts={method,headers:{Authorization:'Bearer '+token()},muteHttpExceptions:true};
    if(body!==undefined){opts.contentType='application/json';opts.payload=JSON.stringify(body);}
    const resp=urlFetchApp.fetch(url,opts);
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
  function query(coll,{where=[],orderBy,limit}={},txId){
    const structuredQuery={from:[{collectionId:coll}]};
    const w=whereClause(where);if(w)structuredQuery.where=w;
    if(orderBy)structuredQuery.orderBy=[{field:{fieldPath:orderBy.field},direction:orderBy.direction==='desc'?'DESCENDING':'ASCENDING'}];
    if(limit!==undefined)structuredQuery.limit=limit;
    const body={structuredQuery};if(txId)body.transaction=txId;
    const rows=call(base+':runQuery','post',body);
    return (Array.isArray(rows)?rows:[]).filter(r=>r.document).map(r=>({id:idOf(r.document.name),fields:decodeFields(r.document.fields)}));
  }
  function batchGetNames(names,txId){
    const body={documents:names};if(txId)body.transaction=txId;
    const rows=call(base+':batchGet','post',body);
    const out=new Map();
    for(const r of Array.isArray(rows)?rows:[]){
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
  function commit(ops){
    const writes=ops.map(o=>o.type==='delete'
      ?{delete:relName(o.coll,o.id),currentDocument:{exists:true}}
      :{update:{name:relName(o.coll,o.id),fields:encodeFields(o.fields)},currentDocument:{exists:o.type==='create'?false:true}});
    return call(base+':commit','post',{writes});
  }
  function batchGetMany(coll,ids){return batchGet(coll,ids);}

  function runTransaction(fn,prefetch){
    const begin=call(base+':beginTransaction','post',{options:{readWrite:{}}});
    const txId=begin&&begin.transaction;
    if(!txId)throw new Error('NO_TRANSACTION_ID');
    const pending=new Map();
    const key=(coll,id)=>coll+'/'+id;
    // Prefetch folds the tx's initial reads (e.g. doc + sequence counter) into ONE
    // batchGet across collections, cutting insert from 4 round-trips to 3.
    const seeded=new Map();
    if(prefetch&&prefetch.length){
      const m=batchGetNames(prefetch.map(p=>relName(p.coll,p.id)),txId);
      for(const p of prefetch){const n=relName(p.coll,p.id);seeded.set(key(p.coll,p.id),m.has(n)?m.get(n):null);}
    }
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

  return Object.freeze({query,runTransaction,commit,batchGetMany});
}