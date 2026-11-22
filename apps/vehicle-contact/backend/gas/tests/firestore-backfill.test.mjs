// F3b-2 offline proof: checksum-verified backfill in primary row order + INDEPENDENT
// read-back audit (write results never trusted), divergence repair (overwrite + extras
// delete + counter reset), audit-only mode, fail-closed snapshot validation, Firestore
// 500-op batch limit, and the live runner's synthetic-DEV gate. Fake db enforces the SDK
// subset contract used by the engine (mock-fidelity rule).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {DATABASE_SCHEMA} from '../src/domain/ports/SchemaRepository.js';
import {runBackfill,checksumRows} from '../scripts/firestore-backfill-engine.mjs';

const COLS=DATABASE_SCHEMA.tables.vc_users.columns.map(c=>c.name);
function rec(id,over={}){
  const base={user_id:id,username_normalized:'user-'+id,display_name:'User '+id,status:'ACTIVE',
    created_at:'2026-11-22T00:00:00.000Z',updated_at:'2026-11-22T00:00:00.000Z'};
  const r={};for(const c of COLS)r[c]=over[c]!==undefined?over[c]:(base[c]!==undefined?base[c]:'');
  return r;
}
function snapshot(tables){return {marker:'SYNTHETIC_DEV_BACKFILL',tables};}
function makeFakeDb(){
  const store=new Map();const state={commits:0,batchSizes:[],writes:0,corrupt:null};
  const table=name=>{if(!store.has(name))store.set(name,new Map());return store.get(name);};
  const collection=name=>({
    doc:id=>({coll:name,id,
      async set(data){table(name).set(id,structuredClone(data));state.writes++;},
      async get(){const m=table(name);return {exists:m.has(id),data:()=>structuredClone(m.get(id))};},
      async delete(){table(name).delete(id);state.writes++;}}),
    async get(){
      let docs=[...table(name).entries()].map(([id,data])=>({id,data:()=>structuredClone(data)}));
      if(state.corrupt)docs=state.corrupt(docs);
      return {docs,size:docs.length};
    }
  });
  return {collection,state,store,
    batch(){
      const ops=[];
      return {set:(ref,data)=>ops.push(['set',ref,data]),delete:ref=>ops.push(['delete',ref]),
        async commit(){
          if(ops.length>500)throw new Error('BATCH_LIMIT_EXCEEDED');
          state.batchSizes.push(ops.length);state.commits++;
          for(const [t,ref,data] of ops){
            if(t==='set'){table(ref.coll).set(ref.id,structuredClone(data));state.writes++;}
            else {table(ref.coll).delete(ref.id);state.writes++;}
          }
        }};
    }};
}

test('BF-01 backfill writes docs in primary order with _seq, resets counter, read-back checksums match',async()=>{
  const db=makeFakeDb();
  const rows=[rec('u1'),rec('u2'),rec('u3')];
  const report=await runBackfill({db,snapshot:snapshot({vc_users:rows})});
  assert.equal(report.status,'PASS');
  const t=report.tables[0];
  assert.equal(t.rows,3);
  assert.equal(t.match,true);
  assert.equal(t.seqParity,true);
  assert.equal(t.readBackChecksum,t.sourceChecksum);
  assert.equal(t.sourceChecksum,checksumRows(rows,'user_id'));
  assert.deepEqual([...db.store.get('vc_users').values()].map(d=>d._seq),[1,2,3],'_seq must follow snapshot order');
  assert.deepEqual(db.store.get('__p6vc_seq').get('vc_users'),{value:3},'counter not reset for dual-write continuity');
});

test('BF-02 audit mode never writes and verifies persisted state independently',async()=>{
  const db=makeFakeDb();
  const rows=[rec('u1'),rec('u2')];
  await runBackfill({db,snapshot:snapshot({vc_users:rows})});
  const writes=db.state.writes,commits=db.state.commits;
  const report=await runBackfill({db,snapshot:snapshot({vc_users:rows}),mode:'audit'});
  assert.equal(report.status,'PASS');
  assert.equal(report.tables[0].seqParity,null);
  assert.equal(db.state.writes,writes,'audit mode wrote to the store');
  assert.equal(db.state.commits,commits);
});

test('BF-03 divergence repair: stale doc overwritten, extra doc deleted, read-back clean',async()=>{
  const db=makeFakeDb();
  await runBackfill({db,snapshot:snapshot({vc_users:[rec('u1',{display_name:'STALE'}),rec('u9')]})});
  const report=await runBackfill({db,snapshot:snapshot({vc_users:[rec('u1')]}),mode:'backfill'});
  assert.equal(report.status,'PASS');
  assert.equal(report.tables[0].match,true);
  assert.equal(db.store.get('vc_users').has('u9'),false,'extra doc not deleted');
  assert.equal(db.store.get('vc_users').get('u1').display_name,'User u1','stale value not repaired');
  assert.deepEqual(db.store.get('__p6vc_seq').get('vc_users'),{value:1});
});

test('BF-04 corrupted persisted data fails the read-back audit (API OK != data proof)',async()=>{
  const db=makeFakeDb();
  db.state.corrupt=docs=>docs.map(d=>d.id==='u1'?{id:d.id,data:()=>({...d.data(),display_name:'TAMPERED'})}:d);
  const report=await runBackfill({db,snapshot:snapshot({vc_users:[rec('u1'),rec('u2')]})});
  assert.equal(report.status,'FAIL');
  assert.equal(report.tables[0].match,false);
  assert.notEqual(report.tables[0].readBackChecksum,report.tables[0].sourceChecksum);
});

test('BF-05 invalid snapshots fail closed BEFORE any write',async()=>{
  const cases=[
    snapshot({vc_unknown:[rec('u1')]}),
    snapshot({vc_users:[{...rec('u1'),user_id:''}]}),
    snapshot({vc_users:[rec('u1'),rec('u1')]}),
    snapshot({vc_users:[{username_normalized:'x'}]}),
    {tables:{vc_users:[rec('u1')]}}
  ];
  for(const bad of cases){
    const db=makeFakeDb();
    await assert.rejects(()=>runBackfill({db,snapshot:bad}),/BACKFILL_INVALID_SNAPSHOT/);
    assert.equal(db.state.writes,0,'write attempted on invalid snapshot');
  }
  const db=makeFakeDb();
  await assert.rejects(()=>runBackfill({db,snapshot:snapshot({vc_users:[]}),mode:'merge'}),/BACKFILL_INVALID_MODE/);
});

test('BF-06 large backfill respects the Firestore 500-op batch limit',async()=>{
  const db=makeFakeDb();
  const rows=Array.from({length:1200},(_,i)=>rec('u'+String(i).padStart(4,'0')));
  const report=await runBackfill({db,snapshot:snapshot({vc_users:rows})});
  assert.equal(report.status,'PASS');
  assert.equal(report.tables[0].rows,1200);
  assert.ok(db.state.commits>=3,'1201 ops must split into >=3 batches');
  assert.ok(db.state.batchSizes.every(n=>n<=500),'batch exceeded 500 ops');
  assert.equal(db.store.get('vc_users').size,1200);
});

test('BF-07 OPEN divergence entries are counted from the snapshot journal',async()=>{
  const db=makeFakeDb();
  const journal=[
    {event_id:'e1',operation:'dualwrite.divergence',entity_id:'vc_users:u1',actor_id:'SYSTEM',status:'OPEN',detail_json:'{}',created_at:'2026-11-22T00:00:00.000Z'},
    {event_id:'e2',operation:'dualwrite.divergence',entity_id:'vc_users:u2',actor_id:'SYSTEM',status:'REPAIRED',detail_json:'{}',created_at:'2026-11-22T00:00:00.000Z'},
    {event_id:'e3',operation:'users.assignRoles',entity_id:'u3',actor_id:'admin',status:'APPLIED',detail_json:'{}',created_at:'2026-11-22T00:00:00.000Z'}
  ];
  const report=await runBackfill({db,snapshot:snapshot({vc_operation_journal:journal})});
  assert.equal(report.status,'PASS');
  assert.equal(report.divergenceOpen,1);
});

test('BF-08 live runner refuses to run without the synthetic-DEV gate (no network)',()=>{
  const script=resolve(import.meta.dirname,'../scripts/firestore-backfill.mjs');
  let out='';
  try{
    execFileSync(process.execPath,[script,'--snapshot','test-results/does-not-exist.json'],
      {env:{...process.env,P6VC_ALLOW_FIRESTORE_BACKFILL:''},encoding:'utf8',timeout:30000});
    assert.fail('runner must exit non-zero without the gate');
  }catch(e){out=e.stdout||'';assert.equal(e.status,1);}
  assert.match(out,/BLOCKED_CONFIG/);
  assert.match(out,/gate required/);
});