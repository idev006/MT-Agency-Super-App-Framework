// POC #2 + #3 live runner: the REAL F3a GAS gateway + F2 adapter against LIVE Firestore
// DEV through the Node sync-fetch bridge. Proves: F1 store-port contract on real Firestore,
// composite-index auto-provisioning (where+orderBy(_seq)), live commit-precondition shapes,
// and per-operation latency. Synthetic DEV only; gated; sanitized gitignored report.
// Run from backend/gas:
//   P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE node scripts/firestore-live-contract.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import './load-env.mjs';
import {DATABASE_SCHEMA} from '../src/domain/ports/SchemaRepository.js';
import {runStorePortContract} from '../tests/store-port-contract.test.mjs';
import {createNodeFirestore} from './node-firestore-bridge.mjs';
import {attachIndexProvisioner} from './firestore-index-provisioner.mjs';

const GATE='RUN_SYNTHETIC_FIRESTORE_PROBE';
const COLS=DATABASE_SCHEMA.tables.vc_users.columns.map(c=>c.name);
function rec(id,over={}){
  const base={user_id:id,username_normalized:'user-'+id,display_name:'User '+id,status:'ACTIVE',
    created_at:'2026-11-22T00:00:00.000Z',updated_at:'2026-11-22T00:00:00.000Z'};
  const r={};for(const c of COLS)r[c]=over[c]!==undefined?over[c]:(base[c]!==undefined?base[c]:'');
  return r;
}
const runner={status:'RUNNING',environment:'FIRESTORE_DEV',projectId:null,databaseId:null,
  startedAt:new Date().toISOString(),calibration:null,contract:null,indexes:[],latency:null,cleanup:null,events:[]};
const save=()=>{
  runner.finishedAt=new Date().toISOString();
  fs.mkdirSync('test-results',{recursive:true});
  fs.writeFileSync('test-results/firestore-live-contract.json',JSON.stringify(runner,null,2)+'\n');
  console.log('FINAL '+JSON.stringify({status:runner.status,projectId:runner.projectId,databaseId:runner.databaseId,
    contract:runner.contract,calibration:runner.calibration,indexes:runner.indexes.length,
    latency:runner.latency,cleanup:runner.cleanup,reason:runner.reason||null,
    seconds:Math.round((Date.parse(runner.finishedAt)-Date.parse(runner.startedAt))/1000)}));
};
const stats=xs=>{const s=xs.slice().sort((a,b)=>a-b);const q=p=>s[Math.min(s.length-1,Math.ceil(p*s.length)-1)];
  return {n:s.length,p50:+q(0.5).toFixed(1),p95:+q(0.95).toFixed(1),max:+s[s.length-1].toFixed(1),
    mean:+(s.reduce((a,b)=>a+b,0)/s.length).toFixed(1)};};

let bridge=null;
try{
  assert.equal(process.env.P6VC_ALLOW_FIRESTORE_DEV_PROBE,GATE,'explicit synthetic-DEV gate required');
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
  runner.projectId=projectId;runner.databaseId=databaseId;

  const node=createNodeFirestore({key,projectId,databaseId});
  bridge=node.bridge;
  const provisioner=attachIndexProvisioner({bridge,projectId,databaseId,
    onEvent:e=>{runner.events.push({...e,at:new Date().toISOString()});
      if(e.type==='INDEX_READY')runner.indexes.push(e.spec);
      console.log(e.type+' '+e.spec.coll+' ['+e.spec.fields.map(f=>f.fieldPath+' '+f.order).join(', ')+']');}});
  const store=provisioner.wrapStore(node.store);
  const gw=node.gateway;
  let auth=null;
  const inner=bridge.fetch.bind(bridge);
  bridge.fetch=(url,opts={})=>{
    if(opts.headers&&opts.headers.Authorization)auth=opts.headers.Authorization;
    const resp=inner(url,opts);
    const code=resp.getResponseCode();
    if(code>=400){
      const ev={type:'HTTP_ERROR',url:String(url),method:opts.method||'get',code,
        req:String(opts.payload||'').slice(0,500),res:resp.getContentText().slice(0,500)};
      runner.events.push(ev);console.log('HTTP_ERROR '+ev.method+' '+ev.url+' '+code+' req='+ev.req+' res='+ev.res);
    }
    return resp;
  };
  const rel=id=>'projects/'+projectId+'/databases/'+databaseId+'/documents/vc_users/'+id;
  const rawCommit=writes=>{
    const resp=bridge.fetch('https://firestore.googleapis.com/v1/projects/'+projectId+'/databases/'+databaseId+'/documents:commit',
      {method:'post',contentType:'application/json',headers:{Authorization:auth},payload:JSON.stringify({writes}),muteHttpExceptions:true});
    let parsed=null;try{parsed=JSON.parse(resp.getContentText());}catch(_){}
    return {http:resp.getResponseCode(),status:parsed&&parsed.error&&parsed.error.status||null};
  };

  // Warm-up: acquires token + captures auth (also proves basic connectivity).
  assert.equal(store.one('vc_users',{user_id:'warmup-absent'}),null);
  console.log('PASS CONNECTIVITY (token + runQuery + auth capture)');

  // POC #3 — live commit-precondition calibration (the offline fake assumes 404/409).
  gw.runTransaction(tx=>tx.create('vc_users','calib-present',{user_id:'calib-present',status:'ACTIVE',_seq:9001}));
  const cal={
    createOnPresent:rawCommit([{update:{name:rel('calib-present'),fields:{user_id:{stringValue:'calib-present'}}},currentDocument:{exists:false}}]),
    updateOnAbsent:rawCommit([{update:{name:rel('calib-absent'),fields:{user_id:{stringValue:'calib-absent'}}},currentDocument:{exists:true}}]),
    deleteOnAbsent:rawCommit([{delete:rel('calib-absent'),currentDocument:{exists:true}}])
  };
  let dupTx=null;
  try{gw.runTransaction(tx=>tx.create('vc_users','calib-present',{user_id:'calib-present'}));dupTx='NO_ERROR';}
  catch(e){dupTx=e.code||String(e.message);}
  cal.duplicateCreateTx=dupTx;
  gw.runTransaction(tx=>tx.delete('vc_users','calib-present'));
  assert.equal(gw.query('vc_users',{where:[{field:'user_id',value:'calib-present'}]}).length,0,'calib residue');
  runner.calibration=cal;
  console.log('PASS CALIBRATION '+JSON.stringify(cal));

  // Pre-clean: a prior failed run may have left contract residue; start from empty.
  for(const row of gw.query('vc_users',{limit:5000}))gw.runTransaction(tx=>tx.delete('vc_users',row.id));
  for(const row of gw.query('__p6vc_seq',{limit:5000}))gw.runTransaction(tx=>tx.delete('__p6vc_seq',row.id));

  // F1 store-port contract on LIVE Firestore (indexes auto-provisioned on demand).
  runStorePortContract(assert,store);
  runner.contract='PASS';
  console.log('PASS F1_STORE_PORT_CONTRACT on live Firestore');

  // Latency micro-benchmark (warm connection; network from this machine to the DB region).
  const N=15,lat={};
  const timed=(op,fn)=>{const t=performance.now();const r=fn();(lat[op]=lat[op]||[]).push(performance.now()-t);return r;};
  const coldInsertStart=performance.now();
  store.insert('vc_users',rec('b00'));
  lat.coldInsertFirst=[performance.now()-coldInsertStart];
  for(let i=1;i<N;i++)timed('insert',()=>store.insert('vc_users',rec('b'+String(i).padStart(2,'0'))));
  for(let i=0;i<N;i++)timed('one',()=>store.one('vc_users',{user_id:'b'+String(i).padStart(2,'0')}));
  for(let i=0;i<N;i++)timed('listFiltered',()=>store.list('vc_users',{status:'ACTIVE'}));
  for(let i=0;i<N;i++)timed('listNewestFiltered',()=>store.listNewest('vc_users',{status:'ACTIVE'},5));
  for(let i=0;i<N;i++)timed('update',()=>store.update('vc_users',{user_id:'b'+String(i).padStart(2,'0')},{display_name:'Bench '+i}));
  for(let i=0;i<N;i++)timed('remove',()=>store.remove('vc_users',{user_id:'b'+String(i).padStart(2,'0')}));
  runner.latency=Object.fromEntries(Object.entries(lat).map(([k,v])=>[k,stats(v)]));
  console.log('PASS LATENCY '+JSON.stringify(runner.latency));

  // Cleanup: contract residue (u1/u3) + counters; independent read-back must show zero.
  for(const row of gw.query('vc_users',{limit:5000}))
    gw.runTransaction(tx=>tx.delete('vc_users',row.id));
  gw.runTransaction(tx=>{if(tx.get('__p6vc_seq','vc_users'))tx.delete('__p6vc_seq','vc_users');});
  const residue=gw.query('vc_users',{limit:5000}).length;
  const counters=gw.query('__p6vc_seq',{}).map(d=>d.id);
  assert.equal(residue,0,'vc_users residue after cleanup');
  assert.ok(!counters.includes('vc_users'),'counter residue after cleanup');
  runner.cleanup={vc_usersResidue:residue,counterDocsRemaining:counters};
  console.log('PASS CLEANUP read-back residue=0');
  runner.status='PASS';
}catch(e){
  runner.status='FAIL';
  runner.reason=String(e&&e.message||e).slice(0,300);
  console.log('FAIL '+runner.reason);
}finally{
  if(bridge)bridge.close();
  save();
  if(runner.status!=='PASS')process.exitCode=1;
}