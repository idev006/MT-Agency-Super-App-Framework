import './load-env.mjs';
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {join,resolve} from 'node:path';

const repoRoot=resolve(import.meta.dirname,'../../../../..');
const scriptsRoot=import.meta.dirname;
const requireAuthenticated=process.argv.includes('--require-authenticated');
const gasUrl=process.env.P6VC_GAS_EXEC_URL||'https://script.google.com/macros/s/AKfycby15c-Aux2za0BuedeIYni8-tc6rkf9ZVNmw-6ZMTgPvG9SvFjuQVSzNoMouiMhqTmxrA/exec';
const reportDir=join(repoRoot,'test-results');
const aggregatePath=join(reportDir,'p6vc-live-api-suite.json');
let sourceCommit=process.env.GITHUB_SHA||null;
if(!sourceCommit)try{sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:repoRoot,encoding:'utf8'}).trim();}catch{}

const suite={status:'RUNNING',sourceCommit,startedAt:new Date().toISOString(),stages:[],secretsExposed:false};
fs.mkdirSync(reportDir,{recursive:true});
const persist=()=>fs.writeFileSync(aggregatePath,JSON.stringify(suite,null,2)+'\n');
const readReport=name=>{
 try{return JSON.parse(fs.readFileSync(join(reportDir,name),'utf8'));}catch{return null;}
};
const counts=report=>({
 tests:Array.isArray(report?.tests)?report.tests.length:0,
 passed:Number(report?.passed)||(Array.isArray(report?.tests)?report.tests.filter(x=>x.status==='PASS').length:0),
 failed:Number(report?.failed)||(Array.isArray(report?.tests)?report.tests.filter(x=>x.status==='FAIL').length:0)
});
async function runStage(id,script,reportName){
 const startedAt=new Date().toISOString();
 const exitCode=await new Promise(resolveExit=>{
  const child=spawn(process.execPath,[join(scriptsRoot,script)],{
   cwd:repoRoot,env:{...process.env,P6VC_GAS_EXEC_URL:gasUrl},stdio:'inherit'
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
await runStage('WORKER_FAIL_CLOSED','../../../../../tools/p6vc-api-test-console/verify-live-worker-failclosed.mjs','p6vc-live-worker-failclosed.json');
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

const ownerReport=readReport('p6vc-live-owner-dev-regression.json');
suite.operationCoverage=authenticated.status==='PASS'&&ownerReport?{
 covered:ownerReport.coverage?.length||0,
 expected:(ownerReport.coverage?.length||0)+(ownerReport.missingOperations?.length||0),
 missingOperations:ownerReport.missingOperations||[]
}:null;
suite.cleanup=(authenticated.status==='PASS'||authenticated.status==='FAIL')&&ownerReport?ownerReport.cleanup||[]:[];
suite.finishedAt=new Date().toISOString();
suite.passed=suite.stages.reduce((n,x)=>n+x.passed,0);
suite.failed=suite.stages.reduce((n,x)=>n+x.failed,0);
suite.status=!preflightPassed||authenticated.status==='FAIL'||authenticated.status.startsWith('BLOCKED')?'FAIL':
 authenticated.status==='PASS'?'PASS':'PASS_PUBLIC_ONLY';
persist();

if(process.env.GITHUB_STEP_SUMMARY){
 const lines=['### P6VC Live API Automation','',`- Status: **${suite.status}**`,`- Source commit: \`${suite.sourceCommit||'unknown'}\``,
  '- Secrets, session tokens, raw responses and PII are excluded.','','| Stage | Status | Passed | Failed |','| --- | --- | ---: | ---: |',
  ...suite.stages.map(x=>`| ${x.id} | ${x.status} | ${x.passed} | ${x.failed} |`)];
 if(suite.operationCoverage)lines.push('',`Authenticated operation coverage: ${suite.operationCoverage.covered}/${suite.operationCoverage.expected}.`);
 fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');
}
console.log('LIVE_SUITE '+JSON.stringify({status:suite.status,passed:suite.passed,failed:suite.failed,
 stages:suite.stages.map(x=>({id:x.id,status:x.status})),report:'test-results/p6vc-live-api-suite.json'}));
if(suite.status==='FAIL')process.exitCode=1;
