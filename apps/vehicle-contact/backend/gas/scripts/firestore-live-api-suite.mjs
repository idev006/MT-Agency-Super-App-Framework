// #69: FULL automated API/use-case pipeline on LIVE Firestore DEV — the REAL application
// (Container → StoreSelector → FirestoreStore → F3a GAS REST gateway) running in Node over
// the sync-fetch bridge. Same case list as the live GAS HTTP regression (single source).
// SSOT rule: NEVER trust the API envelope — every committed write is independently re-read
// through the Node Firestore SDK (a SECOND, independent client implementation) and compared
// field-by-field; deletes must read back absent. Per-op latency excludes audit reads.
// Honest boundary: this measures the Node→Firestore path (keep-alive bridge). The GAS V8
// runtime adds UrlFetchApp overhead; GAS-runtime Firestore mode still needs PUSH_VEHICLE_GAS.
// Synthetic DEV only; gated; sanitized gitignored report; full cleanup + read-back.
// Run from backend/gas:
//   P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE node scripts/firestore-live-api-suite.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import './load-env.mjs';
import {DATABASE_SCHEMA} from '../src/domain/ports/SchemaRepository.js';
import {loadDevFirestoreConfig,createFirestoreNodeComposition} from './firestore-node-composition.mjs';
import {createRegressionCases} from './run-live-owner-dev-regression.mjs';

const ADMIN_USERNAME='p6vc_fs_admin';
const ADMIN_PASSWORD='Synthetic-Firestore-Suite-2026!';
const inventory=JSON.parse(fs.readFileSync(new URL('../../../contracts/api-inventory.v1.json',import.meta.url),'utf8'));
const expectedOperations=new Set(inventory.operations.map(x=>x.group+'.'+x.action));

const report={status:'RUNNING',environment:'FIRESTORE_DEV_NODE_PIPELINE',projectId:null,databaseId:null,
  startedAt:new Date().toISOString(),tests:[],coverage:[],cleanup:[],audit:{commits:0,writes:0,deletes:0,failures:[]},
  latency:null,indexes:[],tokenExchanges:0,finalAudit:null,secretsExposed:false};
const save=()=>{
  report.finishedAt=new Date().toISOString();
  fs.mkdirSync('test-results',{recursive:true});
  fs.writeFileSync('test-results/firestore-live-api-suite.json',JSON.stringify(report,null,2)+'\n');
};
const stats=xs=>{if(!xs.length)return null;const s=xs.slice().sort((a,b)=>a-b);
  const q=p=>s[Math.min(s.length-1,Math.ceil(p*s.length)-1)];
  return {n:s.length,p50:+q(0.5).toFixed(1),p95:+q(0.95).toFixed(1),max:+s[s.length-1].toFixed(1),
    mean:+(s.reduce((a,b)=>a+b,0)/s.length).toFixed(1)};};

// Silent-exit forensics: a drained event loop with a pending await exits 0 without finally.
process.on('beforeExit',code=>{
  console.error('BEFORE_EXIT code='+code+' handles='+process._getActiveHandles().map(h=>h.constructor.name).join(',')
    +' requests='+process._getActiveRequests().length);
});
process.on('unhandledRejection',e=>{console.error('UNHANDLED_REJECTION '+String(e&&e.stack||e));process.exitCode=1;});

let comp=null;
try{
  const {key,keyFile,projectId,databaseId}=loadDevFirestoreConfig();
  report.projectId=projectId;report.databaseId=databaseId;
  comp=createFirestoreNodeComposition({key,keyFile,projectId,databaseId,audit:report.audit,
    onHttpError:e=>{
      let status='';try{const p=JSON.parse(e.body);const r=Array.isArray(p)?p.find(x=>x&&x.error):p;status=r?.error?.status||'';}catch(_){}
      const endpoint=e.url.replace('https://firestore.googleapis.com/v1/projects/'+projectId+'/databases/'+databaseId,'');
      console.log('HTTP_ERROR '+e.code+' '+status+' '+endpoint);
    },
    onIndexEvent:e=>{if(e.type==='INDEX_READY'){report.indexes.push(e.spec);
      console.log('INDEX_READY '+e.spec.coll+' ['+e.spec.fields.map(f=>f.fieldPath+' '+f.order).join(', ')+']');}}});
  const {application,store,sdk,security,fullRow,drainAudits}=comp;

  // Pre-clean: a prior interrupted run may have left synthetic residue; start empty.
  const allCollections=[...Object.keys(DATABASE_SCHEMA.tables),'__p6vc_seq'];
  for(const coll of allCollections){
    const docs=await sdk.collection(coll).listDocuments();
    for(let i=0;i<docs.length;i+=400){
      const batch=sdk.batch();
      for(const d of docs.slice(i,i+400))batch.delete(d);
      await batch.commit();
    }
  }

  // Bootstrap: one synthetic SYSTEM_ADMIN + settings, written through the REAL store port
  // (audited like every other write). Password hashed by the REAL GasSecurity (PBKDF2).
  const now=new Date().toISOString();
  store.insert('vc_settings',fullRow('vc_settings',{key:'idle_timeout_minutes',value:'30',updated_at:now,updated_by:'bootstrap'}));
  store.insert('vc_settings',fullRow('vc_settings',{key:'retention_days',value:'365',updated_at:now,updated_by:'bootstrap'}));
  store.insert('vc_users',fullRow('vc_users',{user_id:'u-fs-admin',username_normalized:ADMIN_USERNAME,
    display_name:'Firestore Suite Admin',password_hash:security.hashPassword(ADMIN_PASSWORD),password_salt:'',
    password_change_required:false,status:'ACTIVE',org_id:'',created_at:now,updated_at:now}));
  store.insert('vc_user_roles',fullRow('vc_user_roles',{assignment_id:'a-fs-admin',user_id:'u-fs-admin',
    role_id:'SYSTEM_ADMIN',status:'ACTIVE',created_at:now,updated_at:now}));
  await drainAudits();
  assert.equal(report.audit.failures.length,0,'bootstrap audit failures: '+JSON.stringify(report.audit.failures));
  console.log('PASS BOOTSTRAP (admin + settings persisted, independently read back)');

  // Transport: local dispatch with per-op latency; audits drain AFTER timing.
  const tag=Date.now().toString(36);
  const lat={};
  async function request(operation,payload={},token=null){
    const split=operation.indexOf('.');
    const t=performance.now();
    const envelope=application.dispatch({apiVersion:'v1',group:operation.slice(0,split),
      action:operation.slice(split+1),payload,...(token?{sessionToken:token}:{}),requestId:'fsLive'+tag},'POST');
    const ms=performance.now()-t;
    (lat[operation]=lat[operation]||[]).push(ms);
    await drainAudits();
    if(!envelope||typeof envelope.ok!=='boolean')throw new Error('INVALID_API_ENVELOPE');
    return envelope;
  }
  const cases=createRegressionCases({request,username:ADMIN_USERNAME,testPassword:ADMIN_PASSWORD,tag,report,persist:save});
  save();
  await cases.run();
  await cases.restore();
  await drainAudits();

  // Final whole-store audit: SDK counts vs store-port counts, per table.
  const finalAudit=[];
  for(const table of Object.keys(DATABASE_SCHEMA.tables)){
    const sdkCount=(await sdk.collection(table).count().get()).data().count;
    const portCount=store.list(table,{},5000).length;
    finalAudit.push({table,sdkCount,portCount,match:sdkCount===portCount});
  }
  report.finalAudit=finalAudit;
  report.tokenExchanges=comp.tokenExchanges();
  report.latency=Object.fromEntries(Object.entries(lat).map(([k,v])=>[k,stats(v)]));
  report.latency.__all=stats(Object.values(lat).flat());
  report.coverage=[...cases.covered].sort();
  report.missingOperations=[...expectedOperations].filter(x=>!cases.covered.has(x)).sort();
  console.log('PASS PIPELINE tests='+report.tests.length+' auditWrites='+report.audit.writes+' auditDeletes='+report.audit.deletes);

  // Cleanup: remove ALL synthetic docs (vc_* + counters) via the SDK, then read back zero.
  const collections=allCollections;
  for(const coll of collections){
    const docs=await sdk.collection(coll).listDocuments();
    for(let i=0;i<docs.length;i+=400){
      const batch=sdk.batch();
      for(const d of docs.slice(i,i+400))batch.delete(d);
      await batch.commit();
    }
  }
  const residue=[];
  for(const coll of collections){
    const c=(await sdk.collection(coll).count().get()).data().count;
    if(c>0)residue.push({coll,count:c});
  }
  report.cleanup.push({id:'FULL_SYNTHETIC_CLEANUP',status:residue.length?'FAIL':'PASS',residue});
  assert.equal(residue.length,0,'cleanup residue: '+JSON.stringify(residue));
  console.log('PASS CLEANUP read-back residue=0 across '+collections.length+' collections');

  report.passed=report.tests.filter(x=>x.status==='PASS').length;
  report.failed=report.tests.filter(x=>x.status==='FAIL').length;
  report.status=(!report.failed&&!report.missingOperations.length&&!report.audit.failures.length
    &&finalAudit.every(x=>x.match)&&report.cleanup.every(x=>x.status==='PASS'))?'PASS':'FAIL';
}catch(e){
  report.status='FAIL';
  report.reason=String(e&&e.message||e).slice(0,300);
  console.log('FAIL '+report.reason);
}finally{
  if(comp)await comp.close();
  save();
  console.log('FINAL '+JSON.stringify({status:report.status,passed:report.passed||0,failed:report.failed||0,
    covered:(report.coverage||[]).length,missing:(report.missingOperations||[]).length,
    auditCommits:report.audit.commits,auditWrites:report.audit.writes,auditDeletes:report.audit.deletes,auditFailures:report.audit.failures.length,
    indexes:report.indexes.length,tokenExchanges:report.tokenExchanges,
    allOps:report.latency&&report.latency.__all,reason:report.reason||null,
    seconds:Math.round((Date.parse(report.finishedAt)-Date.parse(report.startedAt))/1000)}));
  if(report.status!=='PASS')process.exitCode=1;
}