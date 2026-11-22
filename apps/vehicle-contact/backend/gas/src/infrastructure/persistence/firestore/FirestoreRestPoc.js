// POC #1 (F3a de-risk): prove the GAS V8 runtime can reach Firestore DEV over REST
// using service-account OAuth — the production path the Node SDK connectivity probe
// did NOT cover. GAS-only crypto/HTTP via injected Utilities + UrlFetchApp:
//   Utilities.computeRsaSha256Signature(JWT signing input, PEM private key) -> RS256 JWT
//   UrlFetchApp.fetch(oauth2 token endpoint) -> access token
//   UrlFetchApp.fetch(Firestore REST) -> write / read-back / runQuery / transaction / delete
// Synthetic DEV data only; every write verified by an INDEPENDENT read-back. The private
// key and access token are NEVER logged or returned. Editor-only; never exposed via HTTP.
// This is a throwaway proof, NOT the production F3a gateway (which adds the full F2 store
// contract, error mapping, retries and per-collection composite indexes).
const TOKEN_URL='https://oauth2.googleapis.com/token';
const DATASTORE_SCOPE='https://www.googleapis.com/auth/datastore';
const POC_COLLECTION='__p6vc_rest_poc';
const MARKER='SYNTHETIC_DEV_REST_POC';

export function runFirestoreRestPoc({utilities,urlFetchApp,clientEmail,privateKey,projectId,databaseId,clock}){
  const result={status:'RUNNING',environment:'FIRESTORE_DEV',transport:'GAS_REST_SA_OAUTH',
    projectId:projectId||null,databaseId:databaseId||'(default)',pocCollection:POC_COLLECTION,
    tokenAcquired:false,jwtAlgorithm:'RS256',steps:[]};
  const step=(id,fn)=>{
    try{const note=fn();result.steps.push({id,ok:true,...(note||{})});return true;}
    catch(e){result.steps.push({id,ok:false,error:String(e&&e.message||e).slice(0,180)});result.status='FAIL';return false;}
  };
  const nowSeconds=()=>Math.floor((clock?Date.parse(clock()):Date.now())/1000);
  const b64url=data=>utilities.base64EncodeWebSafe(data).replace(/=+$/,'');

  // Firestore REST typed-value codec (plain JS <-> {stringValue|integerValue|...}).
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

  const base='https://firestore.googleapis.com/v1/projects/'+projectId+'/databases/'+(databaseId||'(default)')+'/documents';
  const docName=(coll,id)=>base+'/'+coll+'/'+id;
  function call(url,method,token,body){
    const opts={method,headers:{Authorization:'Bearer '+token},muteHttpExceptions:true};
    if(body!==undefined){opts.contentType='application/json';opts.payload=JSON.stringify(body);}
    const resp=urlFetchApp.fetch(url,opts);
    const code=resp.getResponseCode(),text=resp.getContentText();
    let parsed=null;try{parsed=text?JSON.parse(text):null;}catch(_){parsed=null;}
    return {code,body:parsed};
  }
  function ok(res,label){
    if(res.code<200||res.code>=300)throw new Error(label+'_HTTP_'+res.code);
    return res.body;
  }

  // Service-account OAuth: build + RS256-sign a JWT, exchange it for an access token.
  function accessToken(){
    const iat=nowSeconds();
    const header={alg:'RS256',typ:'JWT'};
    const claims={iss:clientEmail,scope:DATASTORE_SCOPE,aud:TOKEN_URL,iat,exp:iat+3600};
    const signingInput=b64url(JSON.stringify(header))+'.'+b64url(JSON.stringify(claims));
    const signature=utilities.computeRsaSha256Signature(signingInput,privateKey);
    const jwt=signingInput+'.'+b64url(signature);
    const resp=urlFetchApp.fetch(TOKEN_URL,{method:'post',contentType:'application/x-www-form-urlencoded',
      payload:'grant_type='+encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')+'&assertion='+encodeURIComponent(jwt),
      muteHttpExceptions:true});
    if(resp.getResponseCode()!==200)throw new Error('TOKEN_EXCHANGE_HTTP_'+resp.getResponseCode());
    const token=JSON.parse(resp.getContentText()).access_token;
    if(typeof token!=='string'||!token)throw new Error('NO_ACCESS_TOKEN');
    return token; // secret: returned in-memory only, never logged/stored in result
  }

  let token=null;
  const docId='poc-'+utilities.getUuid();
  const createdAt=(clock?clock():new Date().toISOString());
  const synthetic={pocId:docId,marker:MARKER,createdAt,seq:1,payload:{count:42,label:'synthetic-rest-poc',flag:true},tags:['a','b']};

  const configured=step('POC-01.CONFIG',()=>{
    if(typeof clientEmail!=='string'||!clientEmail.includes('@'))throw new Error('INVALID_CLIENT_EMAIL');
    if(typeof privateKey!=='string'||!privateKey.includes('BEGIN PRIVATE KEY'))throw new Error('INVALID_PRIVATE_KEY');
    if(typeof projectId!=='string'||!projectId)throw new Error('INVALID_PROJECT_ID');
    return {note:'project='+projectId+' db='+(databaseId||'(default)')+' sa='+clientEmail.split('@')[0]+'@…'};
  });
  if(!configured){result.reason='config gate failed; no network call attempted';return result;}

  if(!step('POC-02.TOKEN',()=>{token=accessToken();result.tokenAcquired=true;return {note:'SA OAuth JWT(RS256)->access token OK (token not logged)'};})){
    result.reason='GAS service-account OAuth failed; Firestore path not reached';return result;
  }

  step('POC-03.WRITE',()=>{
    ok(call(docName(POC_COLLECTION,docId),'patch',token,{fields:encodeFields(synthetic)}),'WRITE');
    return {note:'doc='+docId};
  });
  step('POC-04.READ_BACK',()=>{
    const body=ok(call(docName(POC_COLLECTION,docId),'get',token),'READ');
    const data=decodeFields(body.fields);
    if(JSON.stringify(data)!==JSON.stringify(synthetic))throw new Error('READ_BACK_MISMATCH');
    return {note:'independent read-back deep-equal OK'};
  });
  step('POC-05.QUERY',()=>{
    const body=ok(call(base+'/'+POC_COLLECTION+':runQuery','post',token,{structuredQuery:{
      from:[{collectionId:POC_COLLECTION}],
      where:{fieldFilter:{field:{fieldPath:'marker'},op:'EQUAL',value:{stringValue:MARKER}}},
      limit:50}}),'QUERY');
    const rows=Array.isArray(body)?body:[];
    const found=rows.some(r=>r.document&&r.document.name===docName(POC_COLLECTION,docId));
    if(!found)throw new Error('QUERY_DID_NOT_RETURN_DOC');
    return {note:'runQuery equality returned '+rows.length+' row(s)'};
  });
  step('POC-06.TRANSACTION',()=>{
    const begin=ok(call(base+':beginTransaction','post',token,{options:{readWrite:{}}}),'BEGIN_TX');
    if(!begin.transaction)throw new Error('NO_TRANSACTION_ID');
    ok(call(base+':commit','post',token,{transaction:begin.transaction,
      writes:[{update:{name:docName(POC_COLLECTION,docId),fields:encodeFields({...synthetic,seq:2})}}]}),'COMMIT');
    const data=decodeFields(ok(call(docName(POC_COLLECTION,docId),'get',token),'TX_READ').fields);
    if(data.seq!==2)throw new Error('TX_WRITE_NOT_PERSISTED');
    return {note:'beginTransaction->commit->read-back seq=2 OK'};
  });
  step('POC-07.DELETE',()=>{
    ok(call(docName(POC_COLLECTION,docId),'delete',token),'DELETE');
    return {note:'deleted '+docId};
  });
  step('POC-08.DELETE_READ_BACK',()=>{
    const res=call(docName(POC_COLLECTION,docId),'get',token);
    if(res.code!==404)throw new Error('DELETE_RESIDUE_HTTP_'+res.code);
    return {note:'delete read-back 404 OK (no residue)'};
  });

  // Best-effort cleanup guarantee: never leave a synthetic POC doc behind.
  if(token){try{call(docName(POC_COLLECTION,docId),'delete',token);}catch(_){/* already gone */}}
  result.status=result.steps.every(s=>s.ok)?'PASS':'FAIL';
  result.passed=result.steps.filter(s=>s.ok).length;
  result.total=result.steps.length;
  return result;
}