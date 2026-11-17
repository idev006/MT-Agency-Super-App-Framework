// Phase-1 API readiness gates: tests the code that EXISTS, not imagined CRUD.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApiRouter} from '../src/api/routes/Router.js';
import {createSheetsSchemaRepository} from '../src/infrastructure/persistence/sheets/SheetsSchemaRepository.js';
import {compareSchema} from '../src/application/schema-sync/CompareSchema.js';
import {DATABASE_SCHEMA,VEHICLE_SCHEMA_V1} from '../src/domain/ports/SchemaRepository.js';

const router=createApiRouter();
function call(group,action,payload={},overrides={}) {
  return router.dispatch({apiVersion:'v1',group,action,payload,...overrides},'POST');
}
function makeFakeSheets(headers) {
  const calls=[];
  const service={openById(id){
    calls.push(['open',id]);
    return {getSheets:()=>Object.entries(headers).map(([name,columns])=>({
      getName(){return name;},
      getLastColumn(){return columns.length;},
      getRange(row,col,height,width){
        calls.push(['header',name,row,col,height,width]);
        assert.equal(row,1);
        assert.equal(height,1);
        return {getDisplayValues(){return [[...columns]];}};
      }
    }))};
  }};
  return {service,calls};
}

test('G1 Schema integration: exact six-header Sheet projection passes without reading PII rows',()=>{
  const headers=Object.fromEntries(Object.entries(VEHICLE_SCHEMA_V1).map(([k,v])=>[k,[...v]]));
  const {service,calls}=makeFakeSheets(headers);
  const result=createSheetsSchemaRepository(service,'synthetic-sheet').verifyHeaders();
  assert.deepEqual(result,{ok:true,mismatches:[]});
  assert.equal(calls.filter(x=>x[0]==='header').length,6);
  assert.ok(calls.filter(x=>x[0]==='header').every(x=>x[2]===1&&x[4]===1));
});

test('G1 Schema integration: unknown column cannot be silently accepted',()=>{
  const headers=Object.fromEntries(Object.entries(VEHICLE_SCHEMA_V1).map(([k,v])=>[k,[...v]]));
  headers.vc_vehicles.push('new_field_from_sheet');
  const diff=compareSchema(DATABASE_SCHEMA,headers);
  assert.equal(diff.match,false);
  assert.equal(diff.changes.some(x=>x.kind==='UNDECLARED_COLUMN'&&x.column==='new_field_from_sheet'),true);
  assert.equal(createSheetsSchemaRepository(makeFakeSheets(headers).service,'synthetic-sheet').verifyHeaders().ok,false);
});

test('G2 AuthN/AuthZ: only health allowed, forged identity, scopes and admin role never enable business API',()=>{
  for(const [group,action] of [['vehicles','lookup'],['vehicles','register'],['contacts','read'],['qr','resolve'],['audit','restricted-report']]){
    for(const forged of [{},{role:'admin'},{authenticated:true,permissions:['*']},{actorId:'owner',scope:'global'}]){
      const result=call(group,action,forged);
      assert.equal(result.ok,false,group+'.'+action);
      assert.equal(result.error.code,'NOT_FOUND');
      assert.equal(result.data,null);
    }
  }
  const health=call('system','health');
  assert.equal(health.ok,true);
  assert.equal(health.data.status,'bootstrap');
});

test('G2 AuthN/AuthZ: invalid versions/payloads and prototype-like groups are rejected',()=>{
  assert.equal(call('system','health',{}, {apiVersion:'v3'}).error.code,'BAD_REQUEST');
  assert.equal(router.dispatch({apiVersion:'v1',group:'system',action:'health',payload:[]},'POST').error.code,'BAD_REQUEST');
  assert.equal(call('__proto__','constructor').ok,false);
});

test('G3 Registration: six-table data model has stable vehicle IDs and a separate photo metadata relationship',()=>{
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
  // The Drive adapter and 5-slot upload path are NOT implemented; this protects against accidental enablement.
});

test('G5 QR: digest-based token metadata exists; issue, resolve and revoke remain disabled until authorization',()=>{
  const fields=DATABASE_SCHEMA.tables.vc_qr_tokens.columns.map(x=>x.name);
  for(const name of ['qr_id','vehicle_id','token_digest','revoked_at','status'])assert.ok(fields.includes(name));
  assert.ok(!fields.includes('token_plaintext'));
  for(const action of ['issue','resolve','revoke']){
    const result=call('qr',action,{role:'admin',token:'synthetic-not-a-secret'});
    assert.equal(result.ok,false);
    assert.equal(result.error.code,'NOT_FOUND');
  }
});
