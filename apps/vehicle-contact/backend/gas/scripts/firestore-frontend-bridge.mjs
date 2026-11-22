// #70: local HTTP bridge exposing the SAME {ok,data,error} envelope contract as the GAS
// Web App, backed by the REAL application on LIVE Firestore DEV (shared Node composition).
// The frontend dev server points at this bridge (worker transport, dev-only local endpoint)
// so every page/role can be E2E-tested against Firestore without any GAS push.
// SSOT: every committed write is independently re-read via the Node SDK before responding.
// Synthetic DEV only; gated; sanitized gitignored audit report. NEVER bundled into GAS.
// Run from backend/gas:
//   P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE node scripts/firestore-frontend-bridge.mjs
import http from 'node:http';
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import './load-env.mjs';
import {loadDevFirestoreConfig,createFirestoreNodeComposition} from './firestore-node-composition.mjs';

const PORT=Number(process.env.P6VC_FRONTEND_BRIDGE_PORT||5178);
const E2E_PASSWORD='Synthetic-Frontend-E2E-2026!';
const ACTORS=[['sys','SYSTEM_ADMIN'],['reg','REGISTRATION_ADMIN'],['staff','STAFF'],['owner','OWNER'],['worker','RETENTION_WORKER']];
const audit={commits:0,writes:0,deletes:0,failures:[]};
const report={status:'RUNNING',environment:'FIRESTORE_DEV_FRONTEND_BRIDGE',port:PORT,
  startedAt:new Date().toISOString(),requests:[],audit,credentials:{password:E2E_PASSWORD,
  actors:ACTORS.map(([name,role])=>({username:'p6vc_e2e_'+name,role}))},secretsExposed:false};
const save=()=>{
  report.finishedAt=new Date().toISOString();
  fs.mkdirSync('test-results',{recursive:true});
  fs.writeFileSync('test-results/firestore-frontend-bridge.json',JSON.stringify(report,null,2)+'\n');
};

const {key,keyFile,projectId,databaseId}=loadDevFirestoreConfig();
const comp=createFirestoreNodeComposition({key,keyFile,projectId,databaseId,audit,
  onIndexEvent:e=>console.log(e.type+' '+e.spec.coll)});
const {application,store,sdk,security,fullRow,drainAudits}=comp;

// Pre-clean: restarts must not collide with residue from a previous bridge session.
// NOTE: never run this bridge concurrently with the API pipeline suite (shared DEV DB).
const {DATABASE_SCHEMA}=await import('../src/domain/ports/SchemaRepository.js');
for(const coll of [...Object.keys(DATABASE_SCHEMA.tables),'__p6vc_seq']){
  const docs=await sdk.collection(coll).listDocuments();
  for(let i=0;i<docs.length;i+=400){
    const batch=sdk.batch();
    for(const d of docs.slice(i,i+400))batch.delete(d);
    await batch.commit();
  }
}

const now=new Date().toISOString();
store.insert('vc_settings',fullRow('vc_settings',{key:'idle_timeout_minutes',value:'30',updated_at:now,updated_by:'bootstrap'}));
store.insert('vc_settings',fullRow('vc_settings',{key:'retention_days',value:'365',updated_at:now,updated_by:'bootstrap'}));
for(const [name,role] of ACTORS){
  store.insert('vc_users',fullRow('vc_users',{user_id:'u-e2e-'+name,username_normalized:'p6vc_e2e_'+name,
    display_name:'E2E '+name,password_hash:security.hashPassword(E2E_PASSWORD),password_salt:'',
    password_change_required:false,status:'ACTIVE',org_id:'',created_at:now,updated_at:now}));
  store.insert('vc_user_roles',fullRow('vc_user_roles',{assignment_id:'a-e2e-'+name,user_id:'u-e2e-'+name,
    role_id:role,status:'ACTIVE',created_at:now,updated_at:now}));
}
await drainAudits();
if(audit.failures.length){console.log('BOOTSTRAP_AUDIT_FAIL '+JSON.stringify(audit.failures));process.exit(1);}
console.log('BOOTSTRAP OK 5 synthetic actors persisted + independently read back');

const server=http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','content-type,accept');
  res.setHeader('Access-Control-Allow-Methods','POST,GET,OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  if(req.method==='GET'&&req.url==='/health'){
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({ok:true,environment:report.environment}));return;
  }
  if(req.method==='GET'&&req.url==='/__audit'){
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({writes:audit.writes,deletes:audit.deletes,failures:audit.failures,requests:report.requests.length}));return;
  }
  if(req.method!=='POST'||req.url!='/api/frontend'){res.writeHead(404);res.end();return;}
  let body='';
  for await(const chunk of req)body+=chunk;
  let operation='unknown';
  try{const r=JSON.parse(body);operation=r.group+'.'+r.action;}catch(_){}
  let envelope;
  const t=performance.now();
  try{
    const request=JSON.parse(body);
    envelope=application.dispatch(request,'POST');
  }catch(e){
    envelope={ok:false,data:null,error:{code:'BAD_REQUEST',message:'Invalid request'},requestId:null};
  }
  const ms=performance.now()-t;
  try{await drainAudits();}
  catch(e){audit.failures.push({stage:'drain',reason:String(e.message).slice(0,120)});}
  report.requests.push({operation,ok:envelope.ok,ms:+ms.toFixed(1),
    errorCode:envelope.ok?null:envelope.error?.code,at:new Date().toISOString()});
  if(report.requests.length%10===0)save();
  console.log('API '+operation+' '+(envelope.ok?'OK':'ERR:'+envelope.error?.code)+' '+ms.toFixed(0)+'ms');
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify(envelope));
});
server.listen(PORT,'127.0.0.1',()=>{
  console.log('FRONTEND_BRIDGE_LISTENING http://127.0.0.1:'+PORT+'/api/frontend project='+projectId);
  save();
});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{
  console.log('SHUTDOWN '+signal);
  server.close();
  await comp.close();
  save();
  process.exit(0);
});