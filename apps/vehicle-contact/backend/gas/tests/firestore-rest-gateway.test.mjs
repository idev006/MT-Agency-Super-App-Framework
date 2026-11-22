// F3a offline proof: the REAL GAS REST gateway (SA OAuth + UrlFetchApp shapes) against a
// fake server that enforces the live-calibrated Firestore REST contract (parent-form verbs,
// relative body names, reordered read keys, real 400s). What ONLY a live run can prove
// remains gated (POC #1 run #2 already closed the GAS-runtime seams for these exact shapes).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFirestoreRestGateway} from '../src/infrastructure/persistence/firestore/FirestoreRestGateway.js';
import {createFakeFirestoreRest,makeFakeUtilities,fakeServiceAccountKey,PROJECT,DATABASE} from './fake-firestore-rest-server.mjs';

const BASE='https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/'+DATABASE+'/documents';
const KEY=fakeServiceAccountKey();
let now='2026-11-22T00:00:00.000Z';
const clock=()=>now;
function run(serverOpts={}){
  now='2026-11-22T00:00:00.000Z';
  const fake=createFakeFirestoreRest(serverOpts);
  const gw=createFirestoreRestGateway({utilities:makeFakeUtilities(),urlFetchApp:fake,
    clientEmail:KEY.client_email,privateKey:KEY.private_key,projectId:PROJECT,databaseId:DATABASE,clock});
  return {gw,fake};
}
const req=(fake,suffix)=>fake.state.requests.find(r=>r.url.endsWith(suffix));
const payload=r=>JSON.parse(r.payload);

test('GW-01 config gate rejects bad credentials before any network call',()=>{
  const fake=createFakeFirestoreRest();
  const base={utilities:makeFakeUtilities(),urlFetchApp:fake,projectId:PROJECT,databaseId:DATABASE,clock};
  assert.throws(()=>createFirestoreRestGateway({...base,clientEmail:'nope',privateKey:KEY.private_key}),/INVALID_CLIENT_EMAIL/);
  assert.throws(()=>createFirestoreRestGateway({...base,clientEmail:KEY.client_email,privateKey:'not-a-pem'}),/INVALID_PRIVATE_KEY/);
  assert.throws(()=>createFirestoreRestGateway({...base,clientEmail:KEY.client_email,privateKey:KEY.private_key,projectId:''}),/INVALID_PROJECT_ID/);
  assert.equal(fake.state.requests.length,0);
});

test('GW-02 access token is cached and refreshed only near expiry',()=>{
  const {gw,fake}=run();
  gw.query('vc_users',{});gw.query('vc_users',{});
  assert.equal(fake.state.tokenCount,1,'token re-requested per call');
  now=new Date(Date.parse(now)+3600*1000).toISOString();
  gw.query('vc_users',{});
  assert.equal(fake.state.tokenCount,2,'expired token not refreshed');
});

test('GW-03 query uses parent-form runQuery, composite AND where, orderBy, limit; decodes rows',()=>{
  const {gw,fake}=run();
  fake.state.seed('vc_users','u1',{user_id:'u1',status:'ACTIVE',tier:'A',_seq:1});
  fake.state.seed('vc_users','u2',{user_id:'u2',status:'ACTIVE',tier:'A',_seq:2});
  fake.state.seed('vc_users','u3',{user_id:'u3',status:'ACTIVE',tier:'B',_seq:3});
  const rows=gw.query('vc_users',{where:[{field:'status',value:'ACTIVE'},{field:'tier',value:'A'}],
    orderBy:{field:'_seq',direction:'desc'},limit:2});
  const r=req(fake,':runQuery');
  assert.equal(r.url,BASE+':runQuery');
  const sq=payload(r).structuredQuery;
  assert.equal(sq.from[0].collectionId,'vc_users');
  assert.equal(sq.where.compositeFilter.op,'AND');
  assert.equal(sq.where.compositeFilter.filters.length,2);
  assert.equal(sq.orderBy[0].field.fieldPath,'_seq');
  assert.equal(sq.orderBy[0].direction,'DESCENDING');
  assert.equal(sq.limit,2);
  assert.deepEqual(rows.map(x=>x.id),['u2','u1']);
  assert.equal(rows[0].fields._seq,2,'integerValue decoded to number');
});

test('GW-04 single filter uses fieldFilter; omitted orderBy/limit stay absent',()=>{
  const {gw,fake}=run();
  fake.state.seed('vc_users','u1',{user_id:'u1',_seq:1});
  gw.query('vc_users',{where:[{field:'user_id',value:'u1'}]});
  const sq=payload(req(fake,':runQuery')).structuredQuery;
  assert.ok(sq.where.fieldFilter,'single equality must be a fieldFilter');
  assert.equal(sq.where.compositeFilter,undefined);
  assert.equal(sq.orderBy,undefined);
  assert.equal(sq.limit,undefined);
  gw.query('vc_users',{});
  const sq2=payload(fake.state.requests.filter(r=>r.url.endsWith(':runQuery')).pop()).structuredQuery;
  assert.equal(sq2.where,undefined,'empty filter must omit where');
});

test('GW-05 transaction reads its own writes and commits precondition-guarded relative-name writes',()=>{
  const {gw,fake}=run();
  fake.state.seed('vc_users','u0',{user_id:'u0',status:'ACTIVE',_seq:0});
  const out=gw.runTransaction(tx=>{
    tx.create('vc_users','u1',{user_id:'u1',status:'ACTIVE',_seq:1});
    assert.equal(tx.get('vc_users','u1').status,'ACTIVE','read-your-writes on get');
    tx.update('vc_users','u1',{status:'SUSPENDED'});
    tx.create('vc_users','u2',{user_id:'u2',_seq:2});
    const rows=tx.query('vc_users',{orderBy:{field:'_seq',direction:'asc'}});
    assert.deepEqual(rows.map(x=>x.id),['u0','u1','u2'],'read-your-writes on query');
    assert.equal(rows[1].fields.status,'SUSPENDED','query sees merged overlay');
    tx.delete('vc_users','u2');
    assert.equal(tx.get('vc_users','u2'),null,'created+deleted in tx nets to absent');
    tx.delete('vc_users','u0');
    return 'done';
  });
  assert.equal(out,'done');
  assert.equal(fake.state.plain('vc_users','u1').status,'SUSPENDED','committed merge persisted');
  assert.equal(fake.state.plain('vc_users','u2'),null,'created+deleted left no residue and no write');
  assert.equal(fake.state.plain('vc_users','u0'),null,'committed delete persisted');
  const commit=req(fake,':commit');
  const body=payload(commit);
  assert.ok(body.transaction,'commit carried the transaction id');
  assert.equal(body.writes.length,2,'create+update merged; net no-op dropped; server delete kept');
  assert.ok(body.writes[0].update.name.startsWith('projects/'),'relative resource name');
  assert.equal(body.writes[0].currentDocument.exists,false,'create guarded exists:false');
  assert.ok(body.writes[1].delete.startsWith('projects/'));
  assert.equal(body.writes[1].currentDocument.exists,true,'delete guarded exists:true');
  assert.equal(req(fake,':rollback'),undefined,'no rollback on success');
  const bg=req(fake,':batchGet');
  assert.ok(payload(bg).documents[0].startsWith('projects/'),'batchGet names relative');
});

test('GW-06 throw inside transaction rolls back server-side and leaves state untouched',()=>{
  const {gw,fake}=run();
  fake.state.seed('vc_users','u1',{user_id:'u1',status:'ACTIVE',_seq:1});
  assert.throws(()=>gw.runTransaction(tx=>{tx.update('vc_users','u1',{status:'X'});throw new Error('boom');}),/boom/);
  assert.equal(fake.state.plain('vc_users','u1').status,'ACTIVE','rollback left committed state intact');
  const rb=req(fake,':rollback');
  assert.ok(rb,'rollback not requested');
  assert.ok(payload(rb).transaction);
  assert.equal(req(fake,':commit'),undefined,'failed transaction must not commit');
});

test('GW-07 create/update/delete fail closed with ALREADY_EXISTS / NOT_FOUND codes',()=>{
  const {gw,fake}=run();
  fake.state.seed('vc_users','u1',{user_id:'u1',_seq:1});
  assert.throws(()=>gw.runTransaction(tx=>tx.create('vc_users','u1',{user_id:'u1'})),e=>e.code==='ALREADY_EXISTS');
  assert.throws(()=>gw.runTransaction(tx=>tx.update('vc_users','absent',{status:'X'})),e=>e.code==='NOT_FOUND');
  assert.throws(()=>gw.runTransaction(tx=>tx.delete('vc_users','absent')),e=>e.code==='NOT_FOUND');
});

test('GW-08 commit precondition race surfaces ALREADY_EXISTS (create lost the race)',()=>{
  const {gw,fake}=run();
  assert.throws(()=>gw.runTransaction(tx=>{
    tx.create('vc_users','u9',{user_id:'u9',_seq:1});
    fake.state.seed('vc_users','u9',{user_id:'u9',status:'RACED',_seq:1});
  }),e=>e.code==='ALREADY_EXISTS');
  assert.equal(fake.state.plain('vc_users','u9').status,'RACED','loser must not overwrite the winner');
});

test('GW-09 nested runTransaction executes inline within the same transaction',()=>{
  const {gw,fake}=run();
  const out=gw.runTransaction(tx=>tx.runTransaction(inner=>{
    inner.create('vc_users','u1',{user_id:'u1',_seq:1});
    return inner.get('vc_users','u1').user_id;
  }));
  assert.equal(out,'u1');
  assert.equal(fake.state.requests.filter(r=>r.url.endsWith(':commit')).length,1,'one atomic commit');
  assert.equal(fake.state.requests.filter(r=>r.url.endsWith(':beginTransaction')).length,1);
});

test('GW-10 token-exchange failure stops before Firestore; secrets never leak',()=>{
  const {gw,fake}=run({tokenFails:true});
  assert.throws(()=>gw.query('vc_users',{}),/TOKEN_EXCHANGE_HTTP_400/);
  assert.equal(fake.state.requests.filter(r=>r.url.startsWith(BASE)).length,0);
  const {gw:gw2,fake:fake2}=run();
  fake2.state.seed('vc_users','u1',{user_id:'u1',_seq:1});
  const rows=gw2.query('vc_users',{});
  const serialized=JSON.stringify(rows)+JSON.stringify(fake2.state.requests.map(r=>r.url));
  assert.ok(!serialized.includes(fake2.state.issuedToken),'token leaked');
  assert.ok(!serialized.includes('BEGIN PRIVATE KEY'),'PEM leaked');
  let message='';
  try{gw2.runTransaction(tx=>tx.update('vc_users','absent',{}));}catch(e){message=e.message;}
  assert.ok(!message.includes(fake2.state.issuedToken)&&!message.includes('BEGIN PRIVATE KEY'),'secret in error message');
});

// Live POC #2 lesson: :runQuery reports a missing composite index as HTTP 400 with a
// STREAM-ARRAY body [{error:{status:'FAILED_PRECONDITION'}}]. The gateway must normalize
// that shape to e.code so callers (index provisioner / retry seams) can react.
test('GW-11 runQuery missing-index error arrives as stream array and surfaces FAILED_PRECONDITION code',()=>{
  const {gw,fake}=run({strictIndexes:true});
  fake.state.seed('vc_users','u1',{user_id:'u1',status:'ACTIVE',_seq:1});
  assert.throws(()=>gw.query('vc_users',{where:[{field:'status',value:'ACTIVE'}],orderBy:{field:'_seq',direction:'asc'}}),
    e=>e.code==='FAILED_PRECONDITION'&&e.httpStatus===400);
  // equality-only (auto-merge) and single-field orderBy (automatic) need no composite
  assert.equal(gw.query('vc_users',{where:[{field:'status',value:'ACTIVE'}]}).length,1);
  assert.equal(gw.query('vc_users',{orderBy:{field:'_seq',direction:'asc'}}).length,1);
  fake.state.addIndex('vc_users',[{fieldPath:'status',order:'ASCENDING'},{fieldPath:'_seq',order:'ASCENDING'}]);
  const rows=gw.query('vc_users',{where:[{field:'status',value:'ACTIVE'}],orderBy:{field:'_seq',direction:'asc'}});
  assert.deepEqual(rows.map(r=>r.id),['u1'],'query succeeds once the composite index exists');
});