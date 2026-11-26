// Admin vehicle-registry read acceptance (synthetic only).
// Proves vehicles.list returns all ACTIVE vehicles for admin roles (no owner filter),
// least-privilege vehicle.list gate, minimal non-PII fields, pagination shape and no mutation.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAcceptanceHarness,assertOk,assertError,FIXED_NOW} from './acceptance-fixture.mjs';

function seedRegistry(h){
 h.seed('vc_vehicles',[
  {vehicle_id:'v-1',plate_normalized:'กข 1',province_code:'TH-10',vehicle_type:'SEDAN',make:'TOYOTA',model:'V1',color:'WHITE',status:'ACTIVE',version:1,created_at:FIXED_NOW,owner_user_id:'u-owner'},
  {vehicle_id:'v-2',plate_normalized:'คค 2',province_code:'TH-10',vehicle_type:'SEDAN',make:'HONDA',model:'V2',color:'BLACK',status:'ACTIVE',version:2,created_at:FIXED_NOW,owner_user_id:'u-reg'},
  {vehicle_id:'v-3',plate_normalized:'งง 3',province_code:'TH-10',vehicle_type:'SEDAN',make:'NISSAN',model:'V3',color:'RED',status:'INACTIVE',version:1,created_at:FIXED_NOW,owner_user_id:'u-owner'}
 ]);
}

test('REG-01 vehicles.list returns every ACTIVE vehicle for SYSTEM_ADMIN and REGISTRATION_ADMIN (no owner filter)',()=>{
 for(const actor of ['sys','reg']){
  const h=createAcceptanceHarness();seedRegistry(h);
  const rows=assertOk(assert,h.as(actor,'vehicles.list',{limit:100}),actor+' registry');
  assert.deepEqual(rows.map(v=>v.vehicleId).sort(),['v-1','v-2'],'ACTIVE only, both owners');
 }
});

test('REG-02 vehicles.list exposes minimal non-PII fields only (no owner id, no contacts)',()=>{
 const h=createAcceptanceHarness();seedRegistry(h);
 const rows=assertOk(assert,h.as('sys','vehicles.list',{limit:100}),'registry fields');
 const allowed=['vehicleId','plate','province','vehicleType','brand','model','color','status','version','createdAt','colorLabel','vehicleTypeLabel','stickerCategory'].sort(); // S2: + display labels; + sticker category (not PII)
 assert.deepEqual(Object.keys(rows[0]).sort(),allowed);
 assert.equal(rows[0].createdAt,FIXED_NOW);
 assert.equal(rows[0].ownerUserId,undefined,'owner id must not leak');
 assert.equal(rows[0].contacts,undefined,'contacts must not leak');
});

test('REG-03 vehicles.list least privilege: STAFF, OWNER, RETENTION_WORKER denied; anonymous unauthenticated',()=>{
 const h=createAcceptanceHarness();seedRegistry(h);
 assertError(assert,h.as('staff','vehicles.list',{limit:100}),'FORBIDDEN','staff lacks vehicle.list');
 assertError(assert,h.as('owner','vehicles.list',{limit:100}),'FORBIDDEN','owner lacks vehicle.list');
 assertError(assert,h.as('worker','vehicles.list',{limit:100}),'FORBIDDEN','worker lacks vehicle.list');
 assertError(assert,h.call('vehicles.list',{limit:100}),'UNAUTHENTICATED','anonymous');
});

test('REG-04 vehicles.list DTO rejects client-supplied filter/identity fields',()=>{
 const h=createAcceptanceHarness();seedRegistry(h);
 assertError(assert,h.as('sys','vehicles.list',{ownerUserId:'u-reg'}),'INVALID_REQUEST','spoofed owner id');
 assertError(assert,h.as('sys','vehicles.list',{status:'INACTIVE'}),'INVALID_REQUEST','client status filter not allowed');
});

test('REG-05 vehicles.list page envelope and no business-row mutation',()=>{
 const h=createAcceptanceHarness();seedRegistry(h);
 const page=assertOk(assert,h.as('sys','vehicles.list',{page:1,pageSize:10}),'paged');
 assert.equal(page.total,2);assert.equal(page.page,1);assert.equal(page.pageSize,10);assert.equal(page.totalPages,1);
 assert.deepEqual(page.items.map(v=>v.vehicleId).sort(),['v-1','v-2']);
 const before=JSON.stringify(h.read('vc_vehicles'));
 h.as('reg','vehicles.list',{limit:100});
 assert.equal(JSON.stringify(h.read('vc_vehicles')),before,'registry read must not mutate business rows');
});