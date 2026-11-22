// P6VC Firestore DEV backfill + independent read-back audit (F3b-2, E1 design §5.4).
// Synthetic DEV data only. Gated: P6VC_ALLOW_FIRESTORE_BACKFILL=RUN_FIRESTORE_BACKFILL_DEV
// AND the snapshot must carry marker SYNTHETIC_DEV_BACKFILL. Uses the Node SDK (preferRest)
// — INDEPENDENT of the GAS REST gateway, per the owner verification directive.
// Usage: node scripts/firestore-backfill.mjs --snapshot test-results/snapshot.json [--audit]
// Snapshot + report live in gitignored test-results/. No credential, token or row content
// is ever printed; the report carries counters + checksums only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import './load-env.mjs';
import {runBackfill} from './firestore-backfill-engine.mjs';

const GATE='RUN_FIRESTORE_BACKFILL_DEV';
const MARKER='SYNTHETIC_DEV_BACKFILL';

const runner={status:'RUNNING',environment:'FIRESTORE_DEV',mode:null,projectId:null,databaseId:null,
  startedAt:new Date().toISOString(),tables:[],blocked:[]};
const save=()=>{
  runner.finishedAt=new Date().toISOString();
  fs.mkdirSync('test-results',{recursive:true});
  fs.writeFileSync('test-results/firestore-backfill.json',JSON.stringify(runner,null,2)+'\n');
  console.log('FINAL '+JSON.stringify({status:runner.status,mode:runner.mode,projectId:runner.projectId,
    databaseId:runner.databaseId,tables:runner.tables.map(t=>({table:t.table,rows:t.rows,match:t.match,seqParity:t.seqParity})),
    divergenceOpen:runner.divergenceOpen??null,reason:runner.reason||null,
    seconds:Math.round((Date.parse(runner.finishedAt)-Date.parse(runner.startedAt))/1000)}));
};

try{
  assert.equal(process.env.P6VC_ALLOW_FIRESTORE_BACKFILL,GATE,'explicit synthetic-DEV backfill gate required');
  const args=process.argv.slice(2);
  const snapshotPath=args[args.indexOf('--snapshot')+1];
  assert.ok(args.includes('--snapshot')&&snapshotPath,'--snapshot <file> required');
  runner.mode=args.includes('--audit')?'audit':'backfill';
  const snapshot=JSON.parse(fs.readFileSync(snapshotPath,'utf8'));
  assert.equal(snapshot.marker,MARKER,'snapshot must be marked SYNTHETIC_DEV_BACKFILL (DEV-only guard)');
  const keyFile=process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const projectId=process.env.FIRESTORE_PROJECT_ID;
  const databaseId=process.env.FIRESTORE_DATABASE_ID||'(default)';
  assert.ok(keyFile&&projectId,'GOOGLE_APPLICATION_CREDENTIALS / FIRESTORE_PROJECT_ID missing');
  assert.ok(fs.existsSync(keyFile),'credential file not found at configured path');
  let repoRoot=process.cwd();
  for(let i=0;i<10&&!fs.existsSync(path.join(repoRoot,'.git'));i++){
    const parent=path.dirname(repoRoot);if(parent===repoRoot)break;repoRoot=parent;
  }
  const resolvedKey=path.resolve(keyFile);
  assert.ok(!resolvedKey.startsWith(path.resolve(repoRoot)+path.sep),'credential file MUST live outside the repo');
  const meta=JSON.parse(fs.readFileSync(resolvedKey,'utf8'));
  assert.equal(meta.type,'service_account','credential is not a service-account key');
  assert.equal(meta.project_id,projectId,'credential project_id != FIRESTORE_PROJECT_ID');
  runner.projectId=projectId;runner.databaseId=databaseId;
  const {Firestore}=await import('@google-cloud/firestore');
  const db=new Firestore({projectId,databaseId,preferRest:true});
  const report=await runBackfill({db,snapshot,mode:runner.mode});
  Object.assign(runner,{tables:report.tables,divergenceOpen:report.divergenceOpen,status:report.status});
}catch(e){
  runner.status=runner.status==='RUNNING'?'BLOCKED_CONFIG':'FAIL';
  runner.reason=String(e?.message||e).slice(0,200);
}finally{
  save();
  if(runner.status!=='PASS')process.exitCode=1;
}