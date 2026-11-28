import './load-env.mjs';
import {spawn,execFileSync} from 'node:child_process';
import {resolveApiBaseUrl} from './trusted-endpoint.mjs';
import fs from 'node:fs';
import {join,resolve} from 'node:path';
import {computeLatency} from './latency-math.mjs';

const repoRoot=resolve(import.meta.dirname,'../../../../..');
const scriptsRoot=import.meta.dirname;
const requireAuthenticated=process.argv.includes('--require-authenticated');
const requireDataProof=process.argv.includes('--require-data-proof');
// SIVP section 10/11: one trusted target for every stage (GAS or Cloud Run). Default (nothing set) =
// the pinned GAS Web App, as before. P6VC_API_BASE_URL vs P6VC_GAS_EXEC_URL conflict -> fail closed.
const DEFAULT_GAS_URL='https://script.google.com/macros/s/AKfycby15c-Aux2za0BuedeIYni8-tc6rkf9ZVNmw-6ZMTgPvG9SvFjuQVSzNoMouiMhqTmxrA/exec';
const target=resolveApiBaseUrl(process.env.P6VC_API_BASE_URL||process.env.P6VC_GAS_EXEC_URL?process.env:{P6VC_GAS_EXEC_URL:DEFAULT_GAS_URL});
const gasUrl=target.url;
const reportDir=join(repoRoot,'test-results');
const aggregatePath=join(reportDir,'p6vc-live-api-suite.json');
let sourceCommit=process.env.GITHUB_SHA||null;
if(!sourceCommit)try{sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:repoRoot,encoding:'utf8'}).trim();}catch{}

// the service under test is part of the evidence (2026-11-27: earlier runs hit GAS /exec via .env without saying so)
const suite={status:'RUNNING',sourceCommit,target:{id:target.id,kind:target.kind,url:target.url},startedAt:new Date().toISOString(),stages:[],secretsExposed:false};
console.log('LIVE_SUITE_TARGET '+JSON.stringify(suite.target));
fs.mkdirSync(reportDir,{recursive:true});
const persist=()=>fs.writeFileSync(aggregatePath,JSON.stringify(suite,null,2)+'\n');
const readReport=name=>{
 try{return JSON.parse(fs.readFileSync(join(reportDir,name),'utf8'));}catch{return null;}
};
const counts=report=>{
 const rows=Array.isArray(report?.tests)?report.tests:Array.isArray(report?.checks)?report.checks:[];
 return {
  tests:rows.length,
  passed:Number(report?.passed)||rows.filter(x=>x.status==='PASS').length,
  failed:Number(report?.failed)||rows.filter(x=>x.status==='FAIL').length
 };
};
async function runStage(id,script,reportName,args=[],extraEnv={}){
 const startedAt=new Date().toISOString();
 // Never read a report left by an earlier run (stale evidence): remove it before the stage starts.
 fs.rmSync(join(reportDir,reportName),{force:true});
 const exitCode=await new Promise(resolveExit=>{
  const child=spawn(process.execPath,[join(scriptsRoot,script),...args],{
   cwd:repoRoot,env:{...process.env,P6VC_GAS_EXEC_URL:gasUrl,P6VC_API_BASE_URL:gasUrl,...extraEnv},stdio:'inherit'
  });
  child.once('error',()=>resolveExit(127));
  child.once('exit',code=>resolveExit(code??1));
 });
 const childReport=readReport(reportName);
 const stage={id,status:exitCode===0&&childReport?.status==='PASS'?'PASS':'FAIL',exitCode,
  ...counts(childReport),report:'test-results/'+reportName,startedAt,finishedAt:new Date().toISOString()};
 if(!childReport)stage.reason='CHILD_REPORT_MISSING';
 suite.stages.push(stage);persist();
 return stage;
}
function skippedStage(id,status,reason){
 const stage={id,status,reason,tests:0,passed:0,failed:0};
 suite.stages.push(stage);persist();
 return stage;
}

persist();
await runStage('PUBLIC_DIRECT_GAS','smoke-api.mjs','p6vc-live-public-smoke.json');
// VC-ADR-056 W1: the Cloudflare Worker is retired; the browser gateway contract is checked on Cloud Run /api/frontend only
// the gateway of the service under test; a GAS target falls back to the core gateway (p6vc-api retired 2026-11-28)
const cloudRunGateway=(target.kind==='cloud-run'?target.url:JSON.parse(fs.readFileSync(new URL('../../../contracts/trusted-endpoints.v1.json',import.meta.url),'utf8'))
 .endpoints.find(e=>e.id==='cloud-run-core').url)+'/api/frontend';
await runStage('CLOUD_RUN_GATEWAY_FAIL_CLOSED','../../cloudrun/verify-gateway-failclosed.mjs','p6vc-live-cloudrun-gateway.json',[],
 {P6VC_GATEWAY_URL:cloudRunGateway,P6VC_GATEWAY_REPORT:'p6vc-live-cloudrun-gateway.json'});
const preflightPassed=suite.stages.every(x=>x.status==='PASS');
let authenticated;
if(!preflightPassed){
 authenticated=skippedStage('AUTHENTICATED_FULL_INVENTORY',requireAuthenticated?'BLOCKED_PREFLIGHT':'SKIPPED_PREFLIGHT','SAFE_PREFLIGHT_FAILED');
}else{
 const hasCredentials=Boolean(process.env.P6VC_TEST_USERNAME&&process.env.P6VC_TEST_PASSWORD);
 const writeGate=process.env.P6VC_ALLOW_OWNER_DEV_WRITES==='RUN_SYNTHETIC_OWNER_DEV';
 if(!hasCredentials||!writeGate){
  const reason=!hasCredentials?'MISSING_TEST_CREDENTIALS':'MISSING_WRITE_CONFIRMATION';
  const status=requireAuthenticated?'BLOCKED_CONFIGURATION':reason==='MISSING_TEST_CREDENTIALS'?'SKIPPED_CREDENTIALS':'SKIPPED_WRITE_GATE';
  authenticated=skippedStage('AUTHENTICATED_FULL_INVENTORY',status,reason);
 }else authenticated=await runStage('AUTHENTICATED_FULL_INVENTORY','run-live-owner-dev-regression.mjs','p6vc-live-owner-dev-regression.json');
}

let dataProof;
if(!requireDataProof){
 dataProof=skippedStage('DATA_PROOF','SKIPPED_DATA_PROOF','NOT_REQUESTED');
}else if(authenticated.status!=='PASS'){
 dataProof=skippedStage('DATA_PROOF','BLOCKED_AUTHENTICATED','AUTHENTICATED_STAGE_NOT_PASS');
}else if(process.env.P6VC_ALLOW_FIRESTORE_DEV_PROBE!=='RUN_SYNTHETIC_FIRESTORE_PROBE'||!process.env.GOOGLE_APPLICATION_CREDENTIALS||!process.env.FIRESTORE_PROJECT_ID){
 dataProof=skippedStage('DATA_PROOF','BLOCKED_CONFIGURATION','MISSING_FIRESTORE_PROBE_GATE_OR_CREDENTIALS');
}else{
 dataProof=await runStage('DATA_PROOF','firestore-readback-proof.mjs','p6vc-firestore-readback-proof.json',['--since',suite.startedAt]);
}

const ownerReport=readReport('p6vc-live-owner-dev-regression.json');
let baseline=null;
try{baseline=JSON.parse(fs.readFileSync(join(scriptsRoot,'latency-baseline.json'),'utf8'));}catch{}
suite.latency=ownerReport?computeLatency(ownerReport.tests,baseline):{n:0,reason:'NO_OWNER_REPORT'};
suite.operationCoverage=authenticated.status==='PASS'&&ownerReport?{
 covered:ownerReport.coverage?.length||0,
 expected:(ownerReport.coverage?.length||0)+(ownerReport.missingOperations?.length||0),
 missingOperations:ownerReport.missingOperations||[]
}:null;
suite.cleanup=(authenticated.status==='PASS'||authenticated.status==='FAIL')&&ownerReport?ownerReport.cleanup||[]:[];
suite.finishedAt=new Date().toISOString();
suite.passed=suite.stages.reduce((n,x)=>n+x.passed,0);
suite.failed=suite.stages.reduce((n,x)=>n+x.failed,0);
suite.status=!preflightPassed||authenticated.status==='FAIL'||authenticated.status.startsWith('BLOCKED')||(requireDataProof&&dataProof.status!=='PASS')?'FAIL':
 // SIVP: an authenticated run is PASS only with the independent Firestore read-back (DATA_PROOF);
 // without it the API results are a claim, not proof -> UNVERIFIED (non-zero exit).
 authenticated.status==='PASS'?(dataProof.status==='PASS'?'PASS':'UNVERIFIED'):'PASS_PUBLIC_ONLY';
persist();

if(process.env.GITHUB_STEP_SUMMARY){
 const lines=['### P6VC Live API Automation','',`- Status: **${suite.status}**`,`- Source commit: \`${suite.sourceCommit||'unknown'}\``,
  '- Secrets, session tokens, raw responses and PII are excluded.','','| Stage | Status | Passed | Failed |','| --- | --- | ---: | ---: |',
  ...suite.stages.map(x=>`| ${x.id} | ${x.status} | ${x.passed} | ${x.failed} |`)];
 if(suite.operationCoverage)lines.push('',`Authenticated operation coverage: ${suite.operationCoverage.covered}/${suite.operationCoverage.expected}.`);
 if(suite.latency?.n)lines.push('',`Latency (authenticated, n=${suite.latency.n}): p50 ${suite.latency.p50} ms / p90 ${suite.latency.p90} ms / p95 ${suite.latency.p95} ms / max ${suite.latency.max} ms — budget ${suite.latency.budget||'N/A'}${suite.latency.p95DeltaPct!=null?` (p95 vs baseline ${suite.latency.p95DeltaPct>0?'+':''}${suite.latency.p95DeltaPct}%)`:''}.`);
 fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');
}
console.log('LIVE_SUITE '+JSON.stringify({status:suite.status,passed:suite.passed,failed:suite.failed,
 stages:suite.stages.map(x=>({id:x.id,status:x.status})),latency:suite.latency?.n?{p50:suite.latency.p50,p95:suite.latency.p95,budget:suite.latency.budget}:undefined,report:'test-results/p6vc-live-api-suite.json'}));
if(suite.status==='FAIL')process.exitCode=1;
else if(suite.status==='UNVERIFIED')process.exitCode=3;
