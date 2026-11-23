// P1 (VC-ADR-028): Script Properties catalog + names-only inspection + one-read snapshot.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SCRIPT_PROPERTIES,snapshotScriptProperties,inspectScriptProperties} from '../src/composition/RuntimeConfig.js';

const SECRET='s3cr3t-value-that-must-never-appear-in-a-report-0123456789';

test('inspection reports NAMES only and never any value',()=>{
  const report=inspectScriptProperties({VEHICLE_API_ENABLED:'true',VEHICLE_AUTH_PEPPER:SECRET,VEHICLE_FIRESTORE_SA_KEY:SECRET,
    VEHICLE_PERSISTENCE_BACKEND:'firestore',VEHICLE_FIRESTORE_POC_APPROVED:'RUN_SYNTHETIC_FIRESTORE_POC',SOMETHING_ELSE:SECRET});
  assert.equal(JSON.stringify(report).includes(SECRET),false);
  assert.equal(report.ok,true);
  assert.deepEqual(report.missingRequired,[]);
  assert.deepEqual(report.retiredPresent,['VEHICLE_PERSISTENCE_BACKEND']);
  assert.deepEqual(report.gatesLeftOn,['VEHICLE_FIRESTORE_POC_APPROVED']);
  assert.deepEqual(report.unknown,['SOMETHING_ELSE']);
});

test('missing required / API disabled / destructive retention on => not ok',()=>{
  assert.deepEqual(inspectScriptProperties({}).missingRequired,['VEHICLE_API_ENABLED','VEHICLE_AUTH_PEPPER','VEHICLE_FIRESTORE_SA_KEY']);
  assert.equal(inspectScriptProperties({VEHICLE_API_ENABLED:'false',VEHICLE_AUTH_PEPPER:'x',VEHICLE_FIRESTORE_SA_KEY:'x'}).ok,false);
  assert.equal(inspectScriptProperties({VEHICLE_API_ENABLED:'true',VEHICLE_AUTH_PEPPER:'x',VEHICLE_FIRESTORE_SA_KEY:'x',
    VEHICLE_RETENTION_EXECUTE_ENABLED:'true'}).ok,false);
});

test('every property name read by source is catalogued',async()=>{
  const {readdirSync,readFileSync,statSync}=await import('node:fs');
  const {join}=await import('node:path');
  const files=[];(function walk(d){for(const f of readdirSync(d)){const p=join(d,f);statSync(p).isDirectory()?walk(p):p.endsWith('.js')&&files.push(p);}})('src');
  const read=new Set();
  for(const f of files){
    const s=readFileSync(f,'utf8');
    for(const m of s.matchAll(/(?:get|set|delete)Property\('([A-Z0-9_]+)'\)/g))read.add(m[1]);
  }
  for(const name of read)assert.ok(SCRIPT_PROPERTIES[name],'uncatalogued property: '+name);
});

test('snapshot = one getProperties() call; facade returns null for absent names',()=>{
  let calls=0;
  const svc={getScriptProperties:()=>({getProperties:()=>{calls++;return {A:'1'};},getProperty:()=>{throw new Error('must not be called');}})};
  const {props,service}=snapshotScriptProperties(svc);
  assert.equal(props.getProperty('A'),'1');
  assert.equal(props.getProperty('B'),null);
  assert.equal(service.getScriptProperties().getProperty('A'),'1');
  assert.equal(calls,1);
});
