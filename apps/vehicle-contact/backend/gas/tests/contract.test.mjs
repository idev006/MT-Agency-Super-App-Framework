import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createApiRouter} from '../src/api/routes/Router.js';
import {createSheetsSchemaRepository} from '../src/infrastructure/persistence/sheets/SheetsSchemaRepository.js';
import {verifySchemaUseCase} from '../src/application/use-cases/VerifySchema.js';
import {VEHICLE_SCHEMA_V1} from '../src/domain/ports/SchemaRepository.js';
const router=createApiRouter();
const call=(group,action,apiVersion='v1')=>router.dispatch({apiVersion,group,action,payload:{}},'POST');
assert.equal(call('system','health').ok,true);
assert.equal(call('vehicles','lookup').ok,false);
assert.equal(call('system','health','v2').ok,false);
assert.equal(call('__proto__','foo').ok,false);
assert.equal(router.dispatch({apiVersion:'v1',group:'system',action:'health',requestId:'bad id'},'POST').requestId,null);
assert.equal(router.dispatch({apiVersion:'v1',group:'system',action:'health',payload:'bad'},'POST').ok,false);
assert.equal(router.dispatch({apiVersion:'v1',group:'system',action:'health',payload:{role:'admin'}},'POST').data.status,'bootstrap');

// Verify repository with fake Sheets API; no live Google connection.
const tabs=Object.fromEntries(Object.entries(VEHICLE_SCHEMA_V1).map(([n,h])=>[n,h]));
const fakeSheets={openById(id){assert.equal(id,'test-sheet-id');return{getSheetByName(name){if(!tabs[name])return null;return{getRange(r,c,n,w){assert.deepEqual([r,c,n,w],[1,1,1,tabs[name].length]);return{getDisplayValues(){return [tabs[name]];}};}};}};}};
const repo=createSheetsSchemaRepository(fakeSheets,'test-sheet-id');
assert.equal(verifySchemaUseCase(repo).ok,true);
delete tabs.vc_vehicles;
assert.equal(verifySchemaUseCase(repo).mismatches[0].reason,'MISSING_TAB');

// Exercise exact GAS output, including global doGet/doPost compatibility.
const root=resolve(import.meta.dirname,'..');
const bundle=readFileSync(join(root,'dist/Code.gs'),'utf8');
const mockContent={MimeType:{JSON:'JSON'},createTextOutput(v){return {value:v,setMimeType(type){return this;}};}};
const context=vm.createContext({ContentService:mockContent,console});
vm.runInContext(bundle,context);
assert.equal(typeof context.doGet,'function');
assert.equal(typeof context.doPost,'function');
assert.equal(typeof context.verifyVehicleSchemaFromEditor,'function');
const health=JSON.parse(context.doGet({}).value);
assert.equal(health.data.status,'bootstrap');
const denied=JSON.parse(context.doPost({postData:{contents:JSON.stringify({apiVersion:'v1',group:'vehicles',action:'lookup',payload:{role:'admin'}})}}).value);
assert.equal(denied.ok,false);
console.log('ESM source + fake Sheets port + GAS bundle contract tests passed');
