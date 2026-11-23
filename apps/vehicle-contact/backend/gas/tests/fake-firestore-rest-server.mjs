// Test-only fake of the Firestore REST v1 surface + Google token endpoint, enforcing the
// REAL contract learned from live POC run #1 (FIRESTORE_REST_LIVE_POC_INCIDENT_20261122.md):
// verb-on-parent URLs only, relative resource names in bodies, nondeterministic map-key
// order on every read, and the real 400 messages for wrong shapes. The token endpoint
// cryptographically verifies the RS256 JWT with a real Node RSA keypair.
// Precondition status codes (ALREADY_EXISTS / NOT_FOUND on commit) are single-document
// semantics; calibrate against live Firestore during the cutover rehearsal (POC #3).
import {generateKeyPairSync,createSign,createVerify,createHash,createHmac,randomUUID} from 'node:crypto';

export const {privateKey:PRIVATE_PEM,publicKey:PUBLIC_PEM}=generateKeyPairSync('rsa',{modulusLength:2048,
  privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
export const CLIENT_EMAIL='p6vc-firestore-dev@mt-iam-core-2026.iam.gserviceaccount.com';
export const PROJECT='mt-iam-core-2026';
export const DATABASE='(default)';
const TOKEN_URL='https://oauth2.googleapis.com/token';
const API_ROOT='https://firestore.googleapis.com/v1/';
const BASE=API_ROOT+'projects/'+PROJECT+'/databases/'+DATABASE+'/documents';
const CLOCK='2026-11-22T00:00:00.000Z';

export function fakeServiceAccountKey(){
  return {type:'service_account',project_id:PROJECT,client_email:CLIENT_EMAIL,private_key:PRIVATE_PEM};
}
const signedBytes=buf=>Array.from(buf,x=>x>127?x-256:x);
export function makeFakeUtilities(){
  return {
    getUuid:randomUUID,
    DigestAlgorithm:{SHA_256:'SHA_256'},
    Charset:{UTF_8:'UTF_8'},
    computeDigest(algo,data){return signedBytes(createHash('sha256').update(String(data),'utf8').digest());},
    computeHmacSha256Signature(value,key){return signedBytes(createHmac('sha256',String(key)).update(String(value)).digest());},
    newBlob(data){return {getBytes:()=>signedBytes(Buffer.from(String(data),'utf8'))};},
    computeRsaSha256Signature(message,pem){return signedBytes(createSign('RSA-SHA256').update(String(message)).sign(pem));},
    base64EncodeWebSafe(data){
      const buf=typeof data==='string'?Buffer.from(data,'utf8'):Buffer.from(data.map(x=>x&255));
      return buf.toString('base64url');
    }
  };
}
const encodeValue=v=>{
  if(v===null||v===undefined)return {nullValue:null};
  if(typeof v==='string')return {stringValue:v};
  if(typeof v==='boolean')return {booleanValue:v};
  if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
  if(Array.isArray(v))return {arrayValue:{values:v.map(encodeValue)}};
  return {mapValue:{fields:encodeFields(v)}};
};
const encodeFields=o=>{const out={};for(const k of Object.keys(o))out[k]=encodeValue(o[k]);return out;};
const decodeValue=v=>{
  if('stringValue' in v)return v.stringValue;
  if('integerValue' in v)return Number(v.integerValue);
  if('doubleValue' in v)return v.doubleValue;
  if('booleanValue' in v)return v.booleanValue;
  if('nullValue' in v)return null;
  if('arrayValue' in v)return (v.arrayValue.values||[]).map(decodeValue);
  if('mapValue' in v)return decodeFields(v.mapValue.fields);
  throw new Error('bad value');
};
const decodeFields=f=>{const o={};for(const k of Object.keys(f||{}))o[k]=decodeValue(f[k]);return o;};
const reorder=f=>{const o={};for(const k of Object.keys(f||{}).sort().reverse()){const v=f[k];o[k]=v.mapValue?{mapValue:{fields:reorder(v.mapValue.fields)}}:v;}return o;};
const matches=(fields,w)=>{
  if(w.fieldFilter)return decodeValue(fields[w.fieldFilter.field.fieldPath])===decodeValue(w.fieldFilter.value);
  if(w.compositeFilter)return w.compositeFilter.filters.every(f=>matches(fields,f));
  throw new Error('bad where');
};

export function createFakeFirestoreRest({tokenFails=false,strictIndexes=false}={}){
  const docs=new Map();
  const txs=new Set();
  const indexes=new Set();
  // rounds = sequential wall-clock rounds (one per fetch OR per fetchAll batch); requests = HTTP calls.
  const state={requests:[],rounds:0,tokenCount:0,issuedToken:null,residue:()=>docs.size,
    seed(coll,id,plain){docs.set(BASE+'/'+coll+'/'+id,encodeFields(plain));},
    plain(coll,id){const f=docs.get(BASE+'/'+coll+'/'+id);return f?decodeFields(f):null;},
    addIndex(coll,fields){indexes.add(coll+'|'+fields.map(f=>f.fieldPath+':'+(f.order||'ASCENDING')).join(','));}};
  const reply=(code,body)=>({getResponseCode:()=>code,getContentText:()=>body===undefined?'':JSON.stringify(body)});
  const err=(code,status,message)=>reply(code,{error:{code,status,message}});
  function fetch(url,opts={}){state.rounds++;return handle(url,opts);}
  // GAS UrlFetchApp.fetchAll: array of {url,...params}, executed in parallel, one round.
  // state.onRequest(url,opts) lets a test interleave a concurrent writer before any call.
  function fetchAll(reqs){state.rounds++;return reqs.map(({url,...opts})=>handle(url,opts));}
  function handle(url,opts={}){
    if(state.onRequest)state.onRequest(url,opts);
    const method=(opts.method||'get').toLowerCase();
    state.requests.push({url,method,payload:opts.payload,headers:opts.headers});
    if(url===TOKEN_URL){
      state.tokenCount++;
      const params=new URLSearchParams(opts.payload);
      const jwt=params.get('assertion');
      const [h,c,s]=jwt.split('.');
      const sigOk=createVerify('RSA-SHA256').update(h+'.'+c).verify(PUBLIC_PEM,Buffer.from(s,'base64url'));
      const claims=JSON.parse(Buffer.from(c,'base64url').toString('utf8'));
      if(tokenFails||!sigOk||claims.iss!==CLIENT_EMAIL||claims.aud!==TOKEN_URL||!(claims.exp>claims.iat))
        return reply(400,{error:'invalid_grant'});
      state.issuedToken='fake-access-token-'+randomUUID();
      return reply(200,{access_token:state.issuedToken,token_type:'Bearer',expires_in:3600});
    }
    if(!url.startsWith(BASE))return err(404,'NOT_FOUND','unknown route');
    if((opts.headers||{}).Authorization!=='Bearer '+state.issuedToken)return err(401,'UNAUTHENTICATED','bad token');
    let rest=url.slice(BASE.length);
    if(rest.startsWith('/'))rest=rest.slice(1);
    const body=opts.payload?JSON.parse(opts.payload):null;
    if(rest.endsWith(':beginTransaction')){const id='tx-'+randomUUID();txs.add(id);return reply(200,{transaction:id});}
    if(rest.endsWith(':rollback')){
      if(!body||!txs.has(body.transaction))return err(400,'INVALID_ARGUMENT','unknown transaction');
      txs.delete(body.transaction);return reply(200,{});
    }
    if(rest.endsWith(':commit')){
      if(body&&body.transaction){
        if(!txs.has(body.transaction))return err(400,'INVALID_ARGUMENT','unknown transaction');
        txs.delete(body.transaction);
      }
      const writeResults=[];
      for(const w of body.writes||[]){
        const rel=w.update?w.update.name:w.delete;
        if(typeof rel!=='string'||!rel.startsWith('projects/'))
          return err(400,'INVALID_ARGUMENT','Document name "'+rel+'" lacks "projects" at index 0.');
        const full=API_ROOT+rel;
        const pre=w.currentDocument;
        if(pre&&pre.exists===false&&docs.has(full))return err(409,'ALREADY_EXISTS','document already exists');
        if(pre&&pre.exists===true&&!docs.has(full))return err(404,'NOT_FOUND','document to modify not found');
        if(w.update&&w.updateMask){
          // Real semantics: only masked paths change; a masked path absent from fields is deleted.
          const next={...docs.get(full)};
          for(const p of w.updateMask.fieldPaths||[]){if(w.update.fields&&p in w.update.fields)next[p]=w.update.fields[p];else delete next[p];}
          docs.set(full,next);writeResults.push({updateTime:CLOCK});
        }
        else if(w.update){docs.set(full,w.update.fields);writeResults.push({updateTime:CLOCK});}
        else{docs.delete(full);writeResults.push({});}
      }
      return reply(200,{writeResults,commitTime:CLOCK});
    }
    if(rest.endsWith(':batchGet')){
      if(body&&body.transaction&&!txs.has(body.transaction))return err(400,'INVALID_ARGUMENT','unknown transaction');
      return reply(200,(body.documents||[]).map(name=>{
        const full=API_ROOT+name;
        return docs.has(full)?{found:{name,fields:reorder(docs.get(full)),createTime:CLOCK,updateTime:CLOCK},readTime:CLOCK}
          :{missing:name,readTime:CLOCK};
      }));
    }
    if(rest.endsWith(':runQuery')){
      if(rest!==':runQuery')return err(400,'INVALID_ARGUMENT','Invalid JSON payload received. Unknown name "structuredQuery" at \'document\': Cannot find field.');
      if(body.transaction&&!txs.has(body.transaction))return err(400,'INVALID_ARGUMENT','unknown transaction');
      const sq=body.structuredQuery||{};
      const coll=(sq.from&&sq.from[0]&&sq.from[0].collectionId)||'';
      if(strictIndexes&&sq.orderBy){
        // Live contract (POC #2): equality-only filters auto-merge and single-field
        // orderBy is automatic, but where+orderBy needs a composite index — and the
        // error arrives as a STREAM ARRAY [{error:{...}}], not a bare {error:{...}}.
        const eq=[];const walk=w=>{if(!w)return;if(w.fieldFilter)eq.push(w.fieldFilter.field.fieldPath);
          if(w.compositeFilter)(w.compositeFilter.filters||[]).forEach(walk);};
        walk(sq.where);
        const ob=sq.orderBy.map(o=>o.field.fieldPath);
        if(eq.some(f=>!ob.includes(f))||ob.length>1){
          const spec=coll+'|'+[...eq.map(f=>f+':ASCENDING'),
            ...sq.orderBy.map(o=>o.field.fieldPath+':'+(o.direction||'ASCENDING'))].join(',');
          if(!indexes.has(spec))
            return reply(400,[{error:{code:400,status:'FAILED_PRECONDITION',message:'The query requires an index.'}}]);
        }
      }
      let rows=[...docs.entries()].filter(([name])=>name.startsWith(BASE+'/'+coll+'/'));
      if(sq.where)rows=rows.filter(([,fields])=>matches(fields,sq.where));
      if(sq.orderBy){
        const o=sq.orderBy[0],f=o.field.fieldPath,dir=o.direction==='DESCENDING'?-1:1;
        rows.sort((a,b)=>{const av=decodeValue(a[1][f]),bv=decodeValue(b[1][f]);return (av<bv?-1:av>bv?1:0)*dir;});
      }
      const lim=sq.limit&&typeof sq.limit==='object'?sq.limit.value:sq.limit;
      if(lim)rows=rows.slice(0,lim);
      return reply(200,rows.map(([name,fields])=>({document:{name:name.slice(API_ROOT.length),fields:reorder(fields),createTime:CLOCK,updateTime:CLOCK},readTime:CLOCK})));
    }
    const [coll,docId]=rest.split('/');
    const name=BASE+'/'+coll+'/'+docId;
    if(method==='get'){
      if(!docs.has(name))return err(404,'NOT_FOUND','Document not found');
      return reply(200,{name,fields:reorder(docs.get(name)),createTime:CLOCK,updateTime:CLOCK});
    }
    return err(405,'METHOD_NOT_ALLOWED','single-doc writes must go through commit');
  }
  return {fetch,fetchAll,state};
}