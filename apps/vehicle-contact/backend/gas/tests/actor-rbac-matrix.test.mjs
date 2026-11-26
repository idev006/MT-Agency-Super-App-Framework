// Exhaustive 56-operation × actor-role authorization acceptance matrix (synthetic only).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DTO_OPERATIONS,DTO_SCHEMAS,validateOperationPayload} from '../src/api/dto/OperationPayloadValidator.js';
import {OPERATION_PERMISSIONS,PUBLIC_OPERATIONS} from '../src/api/controllers/OperationController.js';
import {ROLE_PERMISSIONS} from '../src/application/security/SessionService.js';
import {createAcceptanceHarness} from './acceptance-fixture.mjs';
const inventory=JSON.parse(readFileSync(new URL('../../../contracts/api-inventory.v1.json',import.meta.url),'utf8'));
const declared=inventory.operations.map(x=>x.group+'.'+x.action);
const actors={sys:'SYSTEM_ADMIN',reg:'REGISTRATION_ADMIN',staff:'STAFF',owner:'OWNER',worker:'RETENTION_WORKER'};
const publicOps=new Set(PUBLIC_OPERATIONS);
const dummy=kind=>kind==='s'?'SYNTHETIC':kind==='x'?'Synthetic-Fake-Payload-2026!':
 kind==='n'?1:kind==='b'?true:kind==='a'?[]:kind==='o'?{idle_timeout_minutes:30}:'INVALID_KIND';
const validPayload=op=>{
 const spec=DTO_SCHEMAS[op];if(!spec)throw Error('NO_DTO_SCHEMA:'+op);
 const payload=Object.fromEntries(Object.entries(spec[0]).map(([k,type])=>[k,dummy(type)]));
 if(op==='registrations.submit')payload.photos=['FRONT','REAR','LEFT','RIGHT','FRONT_ANGLE'].map((slot,i)=>({slot,photoId:'fake-'+i}));
 if(op==='users.assignRoles')payload.roles=['STAFF'];
 validateOperationPayload(op,payload);
 return payload;
};
test('MATRIX-00 inventory = 63 routes (62 DTOs + health), public endpoints intentionally scoped',()=>{
 assert.equal(declared.length,63);
 assert.equal(new Set(declared).size,63);
 assert.deepEqual(DTO_OPERATIONS.slice().sort(),declared.filter(x=>x!=='system.health').sort());
 assert.deepEqual([...publicOps].sort(),['auth.login','auth.googleLogin','campaigns.validate','photos.upload','registrations.submit'].sort());
 assert.deepEqual(Object.keys(OPERATION_PERMISSIONS).sort(),declared.filter(op=>op!=='system.health'&&!publicOps.has(op)).sort());
});
test('MATRIX-01 every protected route rejects missing session using a valid DTO, before doing business work',()=>{
 let count=0;
 for(const op of declared.filter(x=>x!=='system.health'&&!publicOps.has(x))){
  const h=createAcceptanceHarness(),before=h.io.writes,response=h.call(op,validPayload(op));
  assert.equal(response.error?.code,'UNAUTHENTICATED',op+': '+JSON.stringify(response));
  assert.equal(h.io.writes,before,'unauthorized call must have no business data writes');
  count++;
 }
 assert.equal(count,57);
 console.log('RBAC anonymous denied at 57 protected operations with schema-valid payloads');
});
test('MATRIX-02 five actor roles × 57 protected operations: server session, not client role, governs access',()=>{
 let total=0,denied=0,granted=0;
 for(const [actor,role]of Object.entries(actors)){
  const grants=ROLE_PERMISSIONS[role];
  for(const op of declared.filter(x=>x!=='system.health'&&!publicOps.has(x))){
   const h=createAcceptanceHarness(),payload=validPayload(op);
   const response=h.as(actor,op,payload);
   const expected=grants.includes(OPERATION_PERMISSIONS[op]);
   if(expected){
    assert.notEqual(response.error?.code,'FORBIDDEN',role+' '+op+' should pass role gate');
    assert.notEqual(response.error?.code,'UNAUTHENTICATED',role+' '+op+' should have valid session');
    granted++;
   } else {
    assert.equal(response.error?.code,'FORBIDDEN',role+' '+op+' must fail RBAC; actual '+JSON.stringify(response.error));
    denied++;
   }
   total++;
  }
 }
 assert.equal(total,285);
 console.log('RBAC 5 roles × 50 operations = '+total+' checks; role-allowed='+granted+', denied='+denied);
});
test('MATRIX-03 anonymous public operations require correct business token or credentials, not fake role',()=>{
 for(const op of [...publicOps]){
  const h=createAcceptanceHarness();
  const r=h.call(op,validPayload(op));
  assert.notEqual(r.error?.code,'UNAUTHENTICATED',op+' must not require session for public entrance');
  assert.notEqual(r.error?.code,'FORBIDDEN',op+' must not treat payload as identity');
  assert.equal(r.ok,false,op+' synthetic no-credential / no-campaign call should be denied or invalid');
 }
});
test('MATRIX-04 protected operations reject client-supplied roles/permissions in DTO and do not perform writes',()=>{
 const h=createAcceptanceHarness();
 const base=h.io.writes;
 const bad=h.call('users.list',{role:'SYSTEM_ADMIN',permissions:['*']});
 assert.equal(bad.error?.code,'INVALID_REQUEST');
 assert.equal(h.io.writes,base);
});
