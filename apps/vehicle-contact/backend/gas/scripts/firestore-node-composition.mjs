// Shared Node→live-Firestore composition for DEV automation (#69 API pipeline, #70 frontend
// bridge). Builds the REAL application (Container → StoreSelector → FirestoreStore → F3a GAS
// REST gateway) over the sync-fetch bridge, with GAS-shaped synthetic services and an
// independent write auditor (Node SDK = second client implementation; SSOT: never trust the
// API envelope alone). Node-only scripts/, NEVER bundled into GAS. Synthetic DEV only.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Firestore} from '@google-cloud/firestore';
import {DATABASE_SCHEMA} from '../src/domain/ports/SchemaRepository.js';
import {createApplication} from '../src/composition/Container.js';
import {createGasSecurity} from '../src/infrastructure/security/GasSecurity.js';
import {createNodeFirestore} from './node-firestore-bridge.mjs';
import {attachIndexProvisioner} from './firestore-index-provisioner.mjs';
import {makeFakeUtilities} from '../tests/fake-firestore-rest-server.mjs';

export const DEV_GATE='RUN_SYNTHETIC_FIRESTORE_PROBE';
export const SYNTHETIC_PEPPER='synthetic-firestore-suite-pepper-0123456789abcdef';

export function loadDevFirestoreConfig(){
  assert.equal(process.env.P6VC_ALLOW_FIRESTORE_DEV_PROBE,DEV_GATE,'explicit synthetic-DEV gate required');
  const keyFile=process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const projectId=process.env.FIRESTORE_PROJECT_ID;
  const databaseId=process.env.FIRESTORE_DATABASE_ID||'(default)';
  assert.ok(keyFile&&projectId,'GOOGLE_APPLICATION_CREDENTIALS / FIRESTORE_PROJECT_ID missing');
  assert.ok(fs.existsSync(keyFile),'credential file not found');
  let repoRoot=process.cwd();
  for(let i=0;i<10&&!fs.existsSync(path.join(repoRoot,'.git'));i++){
    const parent=path.dirname(repoRoot);if(parent===repoRoot)break;repoRoot=parent;
  }
  assert.ok(!path.resolve(keyFile).startsWith(path.resolve(repoRoot)+path.sep),'credential file MUST live outside the repo');
  const key=JSON.parse(fs.readFileSync(keyFile,'utf8'));
  assert.equal(key.type,'service_account');assert.equal(key.project_id,projectId);
  return {key,keyFile,projectId,databaseId};
}

// Independent typed-value decoder (deliberately NOT the gateway's) for commit payloads.
const decodeValue=v=>{
  if('stringValue' in v)return v.stringValue;
  if('integerValue' in v)return Number(v.integerValue);
  if('doubleValue' in v)return v.doubleValue;
  if('booleanValue' in v)return v.booleanValue;
  if('nullValue' in v)return null;
  if('timestampValue' in v)return v.timestampValue;
  if('arrayValue' in v)return (v.arrayValue.values||[]).map(decodeValue);
  if('mapValue' in v)return decodeFields(v.mapValue.fields);
  throw new Error('UNSUPPORTED_VALUE_TYPE');
};
const decodeFields=f=>{const o={};for(const k of Object.keys(f||{}))o[k]=decodeValue(f[k]);return o;};
const sortKeys=x=>Array.isArray(x)?x.map(sortKeys)
  :(x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sortKeys(x[k])])):x);
const canonical=x=>JSON.stringify(sortKeys(x));

export function createFirestoreNodeComposition({key,keyFile,projectId,databaseId,onIndexEvent=()=>{},onHttpError=()=>{},audit}){
  const node=createNodeFirestore({key,projectId,databaseId});
  const bridge=node.bridge;
  const provisioner=attachIndexProvisioner({bridge,projectId,databaseId,onEvent:onIndexEvent});
  const sdk=new Firestore({projectId,databaseId,preferRest:true,
    credentials:{client_email:key.client_email,private_key:key.private_key}});

  // Capture every successful :commit at the transport; drainAudits() re-reads each written
  // or deleted doc through the SDK and compares field-by-field (values never reported).
  const pendingAudits=[];
  const innerFetch=bridge.fetch.bind(bridge);
  let tokenExchanges=0;
  bridge.fetch=(url,opts={})=>{
    if(String(url)==='https://oauth2.googleapis.com/token')tokenExchanges++;
    const resp=innerFetch(url,opts);
    const code=resp.getResponseCode();
    // Error bodies carry only status/message/doc paths (never request field values).
    if(code>=400)onHttpError({url:String(url),code,body:resp.getContentText().slice(0,300)});
    if(String(url).endsWith(':commit')&&code===200&&opts.payload){
      try{
        const body=JSON.parse(opts.payload);
        for(const w of body.writes||[]){
          const rel=w.update?w.update.name:w.delete;
          const docPath=rel.split('/documents/')[1];
          audit.commits=(audit.commits||0)+1;
          pendingAudits.push(w.update
            ?{type:'write',docPath,fields:decodeFields(w.update.fields)}
            :{type:'delete',docPath});
        }
      }catch(e){audit.failures.push({stage:'parse',reason:String(e.message).slice(0,120)});}
    }
    return resp;
  };
  async function drainAudits(){
    // Coalesce per doc: rapid successive commits to the SAME doc (e.g. the _seq counter)
    // supersede each other; the SSOT check is that the FINAL committed state persisted.
    // Reading current state against an intermediate commit would be a false mismatch.
    const lastByDoc=new Map();
    for(const a of pendingAudits)lastByDoc.set(a.docPath,a);
    pendingAudits.length=0;
    for(const a of lastByDoc.values()){
      const snap=await sdk.doc(a.docPath).get();
      if(a.type==='write'){
        audit.writes++;
        if(!snap.exists){audit.failures.push({docPath:a.docPath,reason:'WRITE_NOT_PERSISTED'});continue;}
        const got=snap.data();
        if(canonical(got)!==canonical(a.fields)){
          const keys=[...new Set([...Object.keys(a.fields),...Object.keys(got)])];
          const diff=keys.filter(k=>canonical(got[k])!==canonical(a.fields[k]));
          audit.failures.push({docPath:a.docPath,reason:'FIELD_MISMATCH',fields:diff});
        }
      }else{
        audit.deletes++;
        if(snap.exists)audit.failures.push({docPath:a.docPath,reason:'DELETE_STILL_PRESENT'});
      }
    }
  }

  const propsMap={VEHICLE_API_ENABLED:'true',VEHICLE_PERSISTENCE_BACKEND:'firestore',
    VEHICLE_FIRESTORE_SA_KEY:JSON.stringify(key),VEHICLE_FIRESTORE_PROJECT_ID:projectId,
    VEHICLE_FIRESTORE_DATABASE_ID:databaseId,VEHICLE_AUTH_PEPPER:SYNTHETIC_PEPPER,
    VEHICLE_PHOTOS_FOLDER_ID:'synthetic-folder',VEHICLE_SHEET_ID:'unused-in-firestore-mode'};
  const propertiesService={getScriptProperties:()=>({getProperty:k=>propsMap[k]??null,
    setProperty:(k,v)=>{propsMap[k]=String(v);},deleteProperty:k=>{delete propsMap[k];}})};
  const utilities={...makeFakeUtilities(),
    base64Decode:s=>Array.from(Buffer.from(String(s),'base64'),x=>x>127?x-256:x),
    base64Encode:bytes=>Buffer.from(Array.from(bytes,x=>x&255)).toString('base64'),
    newBlob(data,mime,name){const bytes=typeof data==='string'?Array.from(Buffer.from(data,'utf8')):data;
      return {getBytes:()=>bytes,getContentType:()=>mime,getName:()=>name};}};
  const driveFiles=new Map(),trashed=new Set();let driveSeq=0;
  const driveApp={
    getFolderById:()=>({createFile(blob){const id='synthetic-drive-'+(++driveSeq);driveFiles.set(id,blob);return {getId:()=>id};}}),
    getFileById(id){if(!driveFiles.has(id)||trashed.has(id))throw new Error('NOT_FOUND');
      return {getBlob:()=>driveFiles.get(id),setTrashed:v=>{if(v)trashed.add(id);}};}
  };
  const spreadsheetApp={openById(){throw new Error('SHEETS_MUST_NOT_BE_TOUCHED_IN_FIRESTORE_MODE');}};
  const lockService={getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})};
  const clock=()=>new Date().toISOString();
  const application=createApplication({propertiesService,utilities,urlFetchApp:bridge,
    driveApp,spreadsheetApp,lockService});
  const security=createGasSecurity({utilities,urlFetchApp:bridge,propertiesService,clock});
  const fullRow=(table,over)=>{const r={};for(const c of DATABASE_SCHEMA.tables[table].columns)r[c.name]=over[c.name]!==undefined?over[c.name]:'';return r;};

  async function close(){bridge.close();await sdk.terminate();}
  return {application,store:node.store,gateway:node.gateway,bridge,sdk,security,utilities,
    propsMap,fullRow,drainAudits,tokenExchanges:()=>tokenExchanges,close,provisioner};
}