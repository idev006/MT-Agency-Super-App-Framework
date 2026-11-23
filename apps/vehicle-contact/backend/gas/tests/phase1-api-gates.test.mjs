// Phase-1 API readiness gates: tests the code that EXISTS, not imagined CRUD.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApiRouter} from '../src/api/routes/Router.js';
import {DATABASE_SCHEMA,VEHICLE_SCHEMA_V1} from '../src/domain/ports/SchemaRepository.js';
import {validateVehicleRegistrationDraft} from '../src/domain/policies/VehicleRegistration.js';
import {VEHICLE_PHOTO_SLOTS,validatePhotoSlotSelection} from '../src/domain/policies/PhotoSlots.js';
import {issueQrToken} from '../src/domain/policies/QrTokenPolicy.js';
import {randomBytes,createHash} from 'node:crypto';

const router=createApiRouter();
function call(group,action,payload={},overrides={}) {
  return router.dispatch({apiVersion:'v1',group,action,payload,...overrides},'POST');
}
test('G2 AuthN/AuthZ: only health allowed, forged identity, scopes and admin role never enable business API',()=>{
  for(const [group,action] of [['vehicles','lookup'],['vehicles','register'],['contacts','read'],['qr','resolve'],['audit','restricted-report']]){
    for(const forged of [{},{role:'admin'},{authenticated:true,permissions:['*']},{actorId:'owner',scope:'global'}]){
      const result=call(group,action,forged);
      assert.equal(result.ok,false,group+'.'+action);
      assert.equal(result.error.code,(['vehicles.lookup','contacts.read','qr.resolve'].includes(group+'.'+action)?'SERVICE_UNAVAILABLE':'NOT_FOUND'));
      assert.equal(result.data,null);
    }
  }
  const health=call('system','health');
  assert.equal(health.ok,true);
  assert.equal(health.data.status,'ready');
});

test('G2 AuthN/AuthZ: invalid versions/payloads and prototype-like groups are rejected',()=>{
  assert.equal(call('system','health',{}, {apiVersion:'v3'}).error.code,'BAD_REQUEST');
  assert.equal(router.dispatch({apiVersion:'v1',group:'system',action:'health',payload:[]},'POST').error.code,'BAD_REQUEST');
  assert.equal(call('__proto__','constructor').ok,false);
});

test('G3 Registration: canonical data model has stable vehicle IDs and a separate photo metadata relationship',()=>{
  const tables=DATABASE_SCHEMA.tables;
  assert.ok(tables.vc_vehicles);
  assert.ok(tables.vc_vehicle_contacts);
  assert.ok(tables.vc_vehicle_photos);
  const names=table=>tables[table].columns.map(x=>x.name);
  for(const field of ['vehicle_id','plate_normalized','province_code','version'])assert.ok(names('vc_vehicles').includes(field));
  for(const field of ['photo_id','vehicle_id','slot','storage_ref','status','version'])assert.ok(names('vc_vehicle_photos').includes(field));
  assert.equal(call('vehicles','register',{plate_normalized:'TEST-001',role:'admin'}).ok,false);
  // Not a successful registration test: secure CRUD route intentionally remains disabled.
});

test('G4 Media: file binaries and direct public URLs are not stored as column headers',()=>{
  const fields=DATABASE_SCHEMA.tables.vc_vehicle_photos.columns.map(x=>x.name);
  assert.ok(fields.includes('storage_ref'));
  for(const forbidden of ['public_url','image_base64','raw_photo','file_binary'])assert.ok(!fields.includes(forbidden));
  assert.equal(call('vehicles','upload-photo',{slot:'FRONT',role:'admin'}).ok,false);
  // Unknown media routes remain unavailable; source adapters still require separate runtime verification.
});

test('G5 QR: digest-based token metadata exists; issue, resolve and revoke remain disabled until authorization',()=>{
  const fields=DATABASE_SCHEMA.tables.vc_qr_tokens.columns.map(x=>x.name);
  for(const name of ['qr_id','vehicle_id','token_digest','revoked_at','status'])assert.ok(fields.includes(name));
  assert.ok(!fields.includes('token_plaintext'));
  for(const action of ['issue','resolve','revoke']){
    const result=call('qr',action,{role:'admin',token:'synthetic-not-a-secret'});
    assert.equal(result.ok,false);
    assert.equal(result.error.code,'SERVICE_UNAVAILABLE');
  }
});

test('G3 Registration: synthetic draft validation rejects missing stable vehicle identity or plate',()=>{
  assert.equal(validateVehicleRegistrationDraft({vehicle_id:'v-1',plate_normalized:'ทดสอบ123',province_code:'62',version:0}).valid,true);
  assert.deepEqual(validateVehicleRegistrationDraft({vehicle_id:'v-1',province_code:'62'}).errors,['REQUIRED_PLATE_NORMALIZED']);
  assert.deepEqual(validateVehicleRegistrationDraft({vehicle_id:'v-1',plate_normalized:'TEST',province_code:'62',version:-2}).errors,['INVALID_VERSION']);
});

test('G4 Media: exactly five stable slots; reject duplicate, extra and unknown photo labels',()=>{
  assert.deepEqual(VEHICLE_PHOTO_SLOTS,['FRONT','REAR','LEFT','RIGHT','FRONT_ANGLE']);
  assert.equal(validatePhotoSlotSelection(VEHICLE_PHOTO_SLOTS.map(slot=>({slot}))).valid,true);
  assert.equal(validatePhotoSlotSelection([]).valid,false); // Approved baseline requires all five slots
  assert.equal(validatePhotoSlotSelection([{slot:'FRONT'},{slot:'FRONT'}]).errors.includes('DUPLICATE_SLOT'),true);
  assert.equal(validatePhotoSlotSelection([{slot:'OVERHEAD'}]).errors.includes('INVALID_SLOT'),true);
  assert.equal(validatePhotoSlotSelection([...VEHICLE_PHOTO_SLOTS.map(slot=>({slot})),{slot:'FRONT'}]).errors.includes('TOO_MANY_PHOTOS'),true);
});

test('G5 QR: opaque 256-bit token and SHA-256 digest only when trusted crypto adapters are supplied',()=>{
  const issued=issueQrToken({randomBytes,sha256:value=>createHash('sha256').update(value,'utf8').digest('hex')});
  assert.match(issued.token,/^[a-f0-9]{64}$/);
  assert.equal(issued.token_digest,createHash('sha256').update(issued.token,'utf8').digest('hex'));
  assert.notEqual(issued.token,issued.token_digest);
  assert.throws(()=>issueQrToken({randomBytes:()=>new Uint8Array(8),sha256:()=>''}),/32/);
  assert.throws(()=>issueQrToken({randomBytes:()=>new Uint8Array(32),sha256:()=>''}),/SHA-256/);
  assert.throws(()=>issueQrToken({}),/Trusted cryptography/);
});
