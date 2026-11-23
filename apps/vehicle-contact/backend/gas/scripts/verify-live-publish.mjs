// G6 — post-publish verification chain: live health must match expected-live-version.json,
// then public smoke, then the full authenticated suite WITH independent Firestore data proof.
// Fail-closed: any stage failing stops the chain with FAIL. Synthetic DEV only.
// Run backgrounded (~15-20 min): node scripts/verify-live-publish.mjs
// Reports (sanitized, gitignored): test-results/p6vc-verify-live-publish.json + child reports.
import './load-env.mjs';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import {join,resolve} from 'node:path';

const repoRoot=resolve(import.meta.dirname,'../../../../..');
const scriptsRoot=import.meta.dirname;
const gasUrl=process.env.P6VC_GAS_EXEC_URL||'https://script.google.com/macros/s/AKfycby15c-Aux2za0BuedeIYni8-tc6rkf9ZVNmw-6ZMTgPvG9SvFjuQVSzNoMouiMhqTmxrA/exec';
if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(gasUrl))
 throw new Error('P6VC_GAS_EXEC_URL is missing or invalid');
const reportDir=join(repoRoot,'test-results');
const chainPath=join(reportDir,'p6vc-verify-live-publish.json');
const expected=JSON.parse(fs.readFileSync(join(scriptsRoot,'expected-live-version.json'),'utf8'));

const chain={status:'RUNNING',startedAt:new Date().toISOString(),expected:{
 backendVersion:expected.backendVersion,persistenceEngine:expected.persistenceEngine,dualWrite:expected.dualWrite},
 stages:[],secretsExposed:false};
fs.mkdirSync(reportDir,{recursive:true});
const persist=()=>fs.writeFileSync(chainPath,JSON.stringify(chain,null,2)+'\n');
const finish=status=>{chain.status=status;chain.finishedAt=new Date().toISOString();persist();
 console.log('VERIFY_PUBLISH '+JSON.stringify({status,stages:chain.stages.map(x=>({id:x.id,status:x.status})),report:'test-results/p6vc-verify-live-publish.json'}));
 if(status!=='PASS')process.exitCode=1;};
persist();

// Stage 1: published-version + persistence-flag assertion against live public health.
{
 const stage={id:'HEALTH_VERSION_MATCH',startedAt:new Date().toISOString()};
 try{
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),30000);
  let data;
  try{
   const r=await fetch(gasUrl,{method:'POST',redirect:'follow',signal:controller.signal,
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify({apiVersion:'v1',group:'system',action:'health',payload:{}})});
   data=JSON.parse(await r.text());
  }finally{clearTimeout(timeout);}
  if(data?.ok!==true||data.data?.status!=='ready')throw new Error('health not ready');
  const observed={backendVersion:data.data.backendVersion,
   persistenceEngine:data.data.persistence?.engine,dualWrite:data.data.persistence?.dualWrite};
  stage.observed=observed;
  const mismatches=Object.keys(chain.expected).filter(k=>observed[k]!==chain.expected[k]);
  stage.status=mismatches.length?'FAIL':'PASS';
  if(mismatches.length)stage.reason='MISMATCH: '+mismatches.join(', ')+' (source push is not publication; check clasp deployment version and Script Properties)';
 }catch(e){stage.status='FAIL';stage.reason=String(e?.message||e).slice(0,200);}
 stage.finishedAt=new Date().toISOString();
 chain.stages.push(stage);persist();
 console.log(stage.id+' '+stage.status+(stage.reason?' '+stage.reason:''));
 if(stage.status!=='PASS'){finish('FAIL');process.exit(1);}
}

async function runStage(id,script,reportName,args=[]){
 const startedAt=new Date().toISOString();
 const exitCode=await new Promise(resolveExit=>{
  const child=spawn(process.execPath,[join(scriptsRoot,script),...args],{
   cwd:repoRoot,env:{...process.env,P6VC_GAS_EXEC_URL:gasUrl},stdio:'inherit'});
  child.once('error',()=>resolveExit(127));
  child.once('exit',code=>resolveExit(code??1));
 });
 let childReport=null;
 try{childReport=JSON.parse(fs.readFileSync(join(reportDir,reportName),'utf8'));}catch{}
 const stage={id,status:exitCode===0&&childReport?.status==='PASS'?'PASS':'FAIL',exitCode,
  report:'test-results/'+reportName,startedAt,finishedAt:new Date().toISOString()};
 if(!childReport)stage.reason='CHILD_REPORT_MISSING';
 chain.stages.push(stage);persist();
 return stage;
}

const smoke=await runStage('PUBLIC_SMOKE','smoke-api.mjs','p6vc-live-public-smoke.json');
if(smoke.status!=='PASS'){finish('FAIL');process.exit(1);}
const suite=await runStage('FULL_SUITE_WITH_DATA_PROOF','run-live-api-suite.mjs','p6vc-live-api-suite.json',
 ['--require-authenticated','--require-data-proof']);
finish(suite.status==='PASS'?'PASS':'FAIL');