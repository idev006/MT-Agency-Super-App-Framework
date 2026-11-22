// POC #1 offline proof: the GAS Firestore REST + service-account-OAuth logic is correct
// BEFORE any live GAS run. Uses REAL Node RSA to cryptographically verify the RS256 JWT the
// module builds (fake Utilities.computeRsaSha256Signature signs with a real private key; the
// fake token endpoint verifies with the public key). A fake in-memory Firestore REST server
// exercises write/read-back/runQuery/transaction/delete with independent read-backs.
// What this proves offline: JWT construction+signature, token-exchange request shape, typed
// value codec round-trip, REST request shapes, transaction flow, read-back assertions, and
// secret sanitization. What ONLY a live GAS run can prove: that GAS Utilities actually signs
// a Google-acceptable JWT and UrlFetchApp reaches Google (gated on owner PUSH_VEHICLE_GAS).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createSign,createVerify,randomUUID} from 'node:crypto';
import {runFirestoreRestPoc} from '../src/infrastructure/persistence/firestore/FirestoreRestPoc.js';

const TOKEN_URL='https://oauth2.googleapis.com/token';
const PROJECT='mt-iam-core-2026';
const DATABASE='(default)';
const BASE='https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/'+DATABASE+'/documents';
const CLIENT_EMAIL='p6vc-firestore-dev@'+PROJECT+'.iam.gserviceaccount.com';
const MARKER='SYNTHETIC_DEV_REST_POC';
const COLL='__p6vc_rest_poc';
const CLOCK=()=>'2026-11-22T00:00:00.000Z';

const {privateKey:PRIVATE_PEM,publicKey:PUBLIC_PEM}=generateKeyPairSync('rsa',{modulusLength:2048,
  privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
const signedBytes=buf=>Array.from(buf,x=>x>127?x-256:x);

function makeFakeUtilities(){
  return {
    getUuid:randomUUID,
    computeRsaSha256Signature(message,pem){return signedBytes(createSign('RSA-SHA256').update(String(message)).sign(pem));},
    base64EncodeWebSafe(data){
      const buf=typeof data==='string'?Buffer.from(data,'utf8'):Buffer.from(data.map(x=>x&255));
      return buf.toString('base64url');
    }
  };
}
const decodeValue=v=>{
  if('stringValue' in v)return v.stringValue;
  if('integerValue' in v)return Number(v.integerValue);
  if('doubleValue' in v)return v.doubleValue;
  if('booleanValue' in v)return v.booleanValue;
  if('nullValue' in v)return null;
  if('arrayValue' in v)return (v.arrayValue.values||[]).map(decodeValue);
  if('mapValue' in v){const o={};for(const k of Object.keys(v.mapValue.fields||{}))o[k]=decodeValue(v.mapValue.fields[k]);return o;}
  throw new Error('bad value');
};
const decodeFields=f=>{const o={};for(const k of Object.keys(f||{}))o[k]=decodeValue(f[k]);return o;};

// In-memory Firestore REST server + a token endpoint that REALLY verifies the RS256 JWT.
function makeFakeUrlFetch({tokenFails=false,corruptRead=false,commitFails=false}={}){
  const docs=new Map(); // name -> encoded fields
  const txs=new Set();
  const state={jwtVerified:false,jwtClaims:null,issuedToken:null,requests:[],residue:()=>docs.size};
  const reply=(code,body)=>({getResponseCode:()=>code,getContentText:()=>body===undefined?'':JSON.stringify(body)});
  function fetch(url,opts={}){
    const method=(opts.method||'get').toLowerCase();
    state.requests.push({url,method,payload:opts.payload,headers:opts.headers});
    if(url===TOKEN_URL){
      const params=new URLSearchParams(opts.payload);
      assert.equal(params.get('grant_type'),'urn:ietf:params:oauth:grant-type:jwt-bearer');
      const jwt=params.get('assertion');
      const [h,c,s]=jwt.split('.');
      const sigOk=createVerify('RSA-SHA256').update(h+'.'+c).verify(PUBLIC_PEM,Buffer.from(s,'base64url'));
      const claims=JSON.parse(Buffer.from(c,'base64url').toString('utf8'));
      const header=JSON.parse(Buffer.from(h,'base64url').toString('utf8'));
      state.jwtVerified=sigOk;state.jwtClaims=claims;
      if(tokenFails||!sigOk||header.alg!=='RS256'||claims.iss!==CLIENT_EMAIL
        ||claims.scope!=='https://www.googleapis.com/auth/datastore'||claims.aud!==TOKEN_URL
        ||!(claims.exp>claims.iat))return reply(400,{error:'invalid_grant'});
      state.issuedToken='fake-access-token-'+randomUUID();
      return reply(200,{access_token:state.issuedToken,token_type:'Bearer',expires_in:3600});
    }
    if(!url.startsWith(BASE))return reply(404,{error:{code:404,status:'NOT_FOUND'}});
    if((opts.headers||{}).Authorization!=='Bearer '+state.issuedToken)return reply(401,{error:{code:401,status:'UNAUTHENTICATED'}});
    let rest=url.slice(BASE.length);
    if(rest.startsWith('/'))rest=rest.slice(1);
    const body=opts.payload?JSON.parse(opts.payload):null;
    if(rest.endsWith(':beginTransaction')){const id='tx-'+randomUUID();txs.add(id);return reply(200,{transaction:id});}
    if(rest.endsWith(':commit')){
      if(commitFails)return reply(409,{error:{code:409,status:'ABORTED'}});
      if(body.transaction){if(!txs.has(body.transaction))return reply(400,{error:{code:400,status:'INVALID_ARGUMENT'}});txs.delete(body.transaction);}
      const writeResults=[];
      for(const w of body.writes||[]){
        if(w.update){docs.set(w.update.name,w.update.fields);writeResults.push({updateTime:CLOCK()});}
        else if(w.delete){docs.delete(w.delete);writeResults.push({});}
      }
      return reply(200,{writeResults,commitTime:CLOCK()});
    }
    if(rest.endsWith(':runQuery')){
      const coll=rest.slice(0,-':runQuery'.length);
      const sq=body.structuredQuery||{};
      const ff=sq.where&&sq.where.fieldFilter;
      let rows=[...docs.entries()].filter(([name])=>name.startsWith(BASE+'/'+coll+'/'));
      if(ff)rows=rows.filter(([,fields])=>decodeValue(fields[ff.field.fieldPath])===decodeValue(ff.value));
      if(sq.limit)rows=rows.slice(0,sq.limit);
      return reply(200,rows.map(([name,fields])=>({document:{name,fields,createTime:CLOCK(),updateTime:CLOCK()},readTime:CLOCK()})));
    }
    const [coll,docId]=rest.split('/');
    const name=BASE+'/'+coll+'/'+docId;
    if(method==='patch'){docs.set(name,body.fields);return reply(200,{name,fields:body.fields,createTime:CLOCK(),updateTime:CLOCK()});}
    if(method==='get'){
      if(!docs.has(name))return reply(404,{error:{code:404,status:'NOT_FOUND',message:'Document not found'}});
      let fields=docs.get(name);
      if(corruptRead){fields={...fields,seq:{integerValue:'999'}};}
      return reply(200,{name,fields,createTime:CLOCK(),updateTime:CLOCK()});
    }
    if(method==='delete'){docs.delete(name);return reply(200,{});}
    return reply(405,{error:{code:405,status:'METHOD_NOT_ALLOWED'}});
  }
  return {fetch,state};
}

function run(overrides={},serverOpts={}){
  const fake=makeFakeUrlFetch(serverOpts);
  const result=runFirestoreRestPoc({utilities:makeFakeUtilities(),urlFetchApp:fake,
    clientEmail:CLIENT_EMAIL,privateKey:PRIVATE_PEM,projectId:PROJECT,databaseId:DATABASE,clock:CLOCK,...overrides});
  return {result,fake};
}

test('POC-OFFLINE-01 GAS SA OAuth JWT is a cryptographically valid RS256 assertion',()=>{
  const {result,fake}=run();
  assert.equal(fake.state.jwtVerified,true,'token endpoint did not verify the RS256 signature');
  assert.equal(fake.state.jwtClaims.iss,CLIENT_EMAIL);
  assert.equal(fake.state.jwtClaims.scope,'https://www.googleapis.com/auth/datastore');
  assert.equal(fake.state.jwtClaims.aud,TOKEN_URL);
  assert.ok(fake.state.jwtClaims.exp>fake.state.jwtClaims.iat);
  assert.equal(result.tokenAcquired,true);
});

test('POC-OFFLINE-02 full REST path passes with independent read-backs (8/8)',()=>{
  const {result,fake}=run();
  assert.equal(result.status,'PASS',JSON.stringify(result.steps.filter(s=>!s.ok)));
  assert.equal(result.passed,8);assert.equal(result.total,8);
  assert.ok(result.steps.every(s=>s.ok));
  assert.equal(fake.state.residue(),0,'synthetic POC doc left behind');
  const verbs=fake.state.requests.filter(r=>r.url.startsWith(BASE)).map(r=>r.method);
  assert.ok(verbs.includes('patch'),'write used PATCH');
  assert.ok(verbs.includes('get'),'read-back used GET');
  assert.ok(verbs.includes('post'),'runQuery/transaction used POST');
  assert.ok(verbs.includes('delete'),'delete used DELETE');
});

test('POC-OFFLINE-03 typed-value codec round-trips string/int/bool/nested/array',()=>{
  const {result,fake}=run();
  const write=fake.state.requests.find(r=>r.method==='patch');
  const fields=JSON.parse(write.payload).fields;
  assert.equal(fields.marker.stringValue,MARKER);
  assert.equal(fields.seq.integerValue,'1');
  assert.equal(fields.payload.mapValue.fields.count.integerValue,'42');
  assert.equal(fields.payload.mapValue.fields.flag.booleanValue,true);
  assert.deepEqual(fields.tags.arrayValue.values.map(decodeValue),['a','b']);
  assert.equal(result.steps.find(s=>s.id==='POC-04.READ_BACK').ok,true);
});

test('POC-OFFLINE-04 transaction begins, commits and the write is read back',()=>{
  const {result,fake}=run();
  const begin=fake.state.requests.find(r=>r.url.endsWith(':beginTransaction'));
  const commit=fake.state.requests.find(r=>r.url.endsWith(':commit'));
  assert.ok(begin&&commit,'beginTransaction/commit not called');
  assert.ok(JSON.parse(commit.payload).transaction,'commit carried the transaction id');
  assert.equal(result.steps.find(s=>s.id==='POC-06.TRANSACTION').ok,true);
});

test('POC-OFFLINE-05 secrets never appear in the returned/logged result',()=>{
  const {result,fake}=run();
  const serialized=JSON.stringify(result);
  assert.ok(!serialized.includes(fake.state.issuedToken),'access token leaked into result');
  assert.ok(!serialized.includes('BEGIN PRIVATE KEY'),'private key leaked into result');
  assert.ok(!serialized.includes(PRIVATE_PEM),'private key PEM leaked into result');
  assert.ok(!serialized.includes('fake-access-token'),'token prefix leaked');
});

test('POC-OFFLINE-06 token-exchange failure stops before any Firestore call',()=>{
  const {result,fake}=run({},{tokenFails:true});
  assert.equal(result.status,'FAIL');
  assert.equal(result.tokenAcquired,false);
  assert.match(result.reason,/OAuth/);
  assert.equal(fake.state.requests.filter(r=>r.url.startsWith(BASE)).length,0,'Firestore called without a token');
});

test('POC-OFFLINE-07 read-back mismatch is detected (API OK != data proof)',()=>{
  const {result}=run({},{corruptRead:true});
  assert.equal(result.status,'FAIL');
  assert.equal(result.steps.find(s=>s.id==='POC-04.READ_BACK').ok,false);
});

test('POC-OFFLINE-08 transaction commit failure is detected',()=>{
  const {result}=run({},{commitFails:true});
  assert.equal(result.status,'FAIL');
  assert.equal(result.steps.find(s=>s.id==='POC-06.TRANSACTION').ok,false);
});

test('POC-OFFLINE-09 config gate rejects a bad key before any network call',()=>{
  const {result,fake}=run({privateKey:'not-a-pem'});
  assert.equal(result.status,'FAIL');
  assert.equal(result.steps.find(s=>s.id==='POC-01.CONFIG').ok,false);
  assert.equal(fake.state.requests.length,0,'network called despite invalid config');
});