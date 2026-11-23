// POC (owner ask 2026-11-23): "เขียน GAS เพื่อทำ CRUD กับ Firestore" — a SHORT, READABLE
// CRUD client over Firestore REST v1 + service-account OAuth. A learning/template example,
// NOT the production store (that is FirestoreRestGateway.js + FirestoreStore.js, which add
// transactions, _seq ordering and error mapping). Editor-only via pocFirestoreCrudFromEditor;
// never reachable over doGet/doPost. Synthetic DEV data in its own collection, always cleaned
// up. Logs/returns step names + counters only — never the key, token or document values.
const TOKEN_URL='https://oauth2.googleapis.com/token';
const SCOPE='https://www.googleapis.com/auth/datastore';
export const CRUD_POC_COLLECTION='__p6vc_crud_poc';

export function createFirestoreCrud({utilities,urlFetchApp,key,projectId,databaseId}){
  const base='https://firestore.googleapis.com/v1/projects/'+(projectId||key.project_id)
    +'/databases/'+(databaseId||'(default)')+'/documents';
  const enc=encodeURIComponent;

  // ---- 1) OAuth: sign a JWT with the SA key, swap it for an access token (cached ~1 h) ----
  let cached=null;
  function token(){
    const now=Math.floor(Date.now()/1000);
    if(cached&&now<cached.exp)return cached.token;
    const b64=s=>utilities.base64EncodeWebSafe(s).replace(/=+$/,'');
    const unsigned=b64(JSON.stringify({alg:'RS256',typ:'JWT'}))+'.'
      +b64(JSON.stringify({iss:key.client_email,scope:SCOPE,aud:TOKEN_URL,iat:now,exp:now+3600}));
    const jwt=unsigned+'.'+b64(utilities.computeRsaSha256Signature(unsigned,key.private_key));
    const resp=urlFetchApp.fetch(TOKEN_URL,{method:'post',muteHttpExceptions:true,
      payload:{grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt}});
    if(resp.getResponseCode()!==200)throw new Error('TOKEN_HTTP_'+resp.getResponseCode());
    const body=JSON.parse(resp.getContentText());
    cached={token:body.access_token,exp:now+(body.expires_in||3600)-60};
    return cached.token;
  }

  // ---- 2) One REST call; non-2xx throws FIRESTORE_<STATUS> with e.status ----
  function call(method,path,body){
    const opts={method,headers:{Authorization:'Bearer '+token()},muteHttpExceptions:true};
    if(body!==undefined){opts.contentType='application/json';opts.payload=JSON.stringify(body);}
    const resp=urlFetchApp.fetch(base+path,opts);
    const code=resp.getResponseCode(),text=resp.getContentText();
    const json=text?JSON.parse(text):{};
    if(code<200||code>=300){
      const root=Array.isArray(json)?json.find(x=>x&&x.error)||{}:json;
      const status=(root.error&&root.error.status)||('HTTP_'+code);
      throw Object.assign(new Error('FIRESTORE_'+status),{status});
    }
    return json;
  }

  // ---- 3) Plain JS <-> Firestore typed values ----
  function toFs(v){
    if(v===null||v===undefined)return {nullValue:null};
    if(typeof v==='string')return {stringValue:v};
    if(typeof v==='boolean')return {booleanValue:v};
    if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
    if(Array.isArray(v))return {arrayValue:{values:v.map(toFs)}};
    return {mapValue:{fields:toFields(v)}};
  }
  function toFields(obj){const out={};for(const k of Object.keys(obj))out[k]=toFs(obj[k]);return out;}
  function fromFs(v){
    if('stringValue' in v)return v.stringValue;
    if('integerValue' in v)return Number(v.integerValue);
    if('doubleValue' in v)return v.doubleValue;
    if('booleanValue' in v)return v.booleanValue;
    if('timestampValue' in v)return v.timestampValue;
    if('nullValue' in v)return null;
    if('arrayValue' in v)return (v.arrayValue.values||[]).map(fromFs);
    if('mapValue' in v)return fromFields(v.mapValue.fields);
    return undefined;
  }
  function fromFields(fields){const out={};for(const k of Object.keys(fields||{}))out[k]=fromFs(fields[k]);return out;}
  const withId=doc=>({_id:doc.name.split('/').pop(),...fromFields(doc.fields)});

  // ---- 4) CRUD ----
  return Object.freeze({
    /** CREATE — new doc; duplicate id → FIRESTORE_ALREADY_EXISTS */
    create(coll,id,data){
      return withId(call('post','/'+enc(coll)+'?documentId='+enc(id),{fields:toFields(data)}));
    },
    /** READ — by id; missing → null */
    get(coll,id){
      try{return withId(call('get','/'+enc(coll)+'/'+enc(id)));}
      catch(e){if(e.status==='NOT_FOUND')return null;throw e;}
    },
    /** UPDATE — only the given fields (updateMask); missing doc → FIRESTORE_NOT_FOUND */
    update(coll,id,patch){
      const mask=Object.keys(patch).map(f=>'updateMask.fieldPaths='+enc(f)).join('&');
      return withId(call('patch','/'+enc(coll)+'/'+enc(id)+'?'+mask+'&currentDocument.exists=true',{fields:toFields(patch)}));
    },
    /** DELETE — missing doc → FIRESTORE_NOT_FOUND */
    remove(coll,id){
      call('delete','/'+enc(coll)+'/'+enc(id)+'?currentDocument.exists=true');
      return true;
    },
    /** LIST — whole collection, paged */
    list(coll,pageSize=100){
      const out=[];let page='';
      do{
        const res=call('get','/'+enc(coll)+'?pageSize='+pageSize+(page?'&pageToken='+enc(page):''));
        for(const d of res.documents||[])out.push(withId(d));
        page=res.nextPageToken||'';
      }while(page);
      return out;
    },
    /** QUERY — field == value */
    whereEqual(coll,field,value){
      const rows=call('post',':runQuery',{structuredQuery:{from:[{collectionId:coll}],
        where:{fieldFilter:{field:{fieldPath:field},op:'EQUAL',value:toFs(value)}}}});
      return rows.filter(r=>r.document).map(r=>withId(r.document));
    }
  });
}

// ---- 5) POC runner: every CRUD step verified by an independent read-back, always cleaned up ----
export function runFirestoreCrudPoc(crud,{newId}){
  const coll=CRUD_POC_COLLECTION,id='poc-'+newId(),steps=[],started=Date.now();
  const check=(step,ok)=>{steps.push({step,ok:!!ok});if(!ok)throw new Error('POC_FAIL:'+step);};
  const rejects=(fn,status)=>{try{fn();return false;}catch(e){return e.status===status;}};
  try{
    crud.create(coll,id,{marker:'SYNTHETIC_DEV_CRUD_POC',plate:'TST00000000',count:1,active:true});
    const created=crud.get(coll,id);
    check('CREATE + read-back',created&&created.count===1&&created.active===true);
    check('CREATE duplicate rejected',rejects(()=>crud.create(coll,id,{marker:'dup'}),'ALREADY_EXISTS'));
    crud.update(coll,id,{count:2});
    const updated=crud.get(coll,id);
    check('UPDATE (masked) + read-back',updated.count===2&&updated.plate==='TST00000000');
    check('LIST contains doc',crud.list(coll,50).some(d=>d._id===id));
    check('QUERY where plate ==',crud.whereEqual(coll,'plate','TST00000000').some(d=>d._id===id));
    crud.remove(coll,id);
    check('DELETE + read-back null',crud.get(coll,id)===null);
    check('UPDATE missing rejected',rejects(()=>crud.update(coll,id,{count:3}),'NOT_FOUND'));
    return {status:'PASS',steps,passed:steps.length,elapsedMs:Date.now()-started};
  }catch(e){
    return {status:'FAIL',steps,passed:steps.filter(s=>s.ok).length,error:String(e.message).slice(0,120),elapsedMs:Date.now()-started};
  }finally{
    try{if(crud.get(coll,id))crud.remove(coll,id);}catch(_){/* best effort cleanup */}
  }
}
