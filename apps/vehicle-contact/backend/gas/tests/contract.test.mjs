import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createApiRouter} from '../src/api/routes/Router.js';
import {createSheetsSchemaRepository} from '../src/infrastructure/persistence/sheets/SheetsSchemaRepository.js';
import {verifySchemaUseCase} from '../src/application/use-cases/VerifySchema.js';
import {compareSchema} from '../src/application/schema-sync/CompareSchema.js';
import {proposeSchemaChanges} from '../src/application/schema-sync/ProposeMigration.js';
import {VEHICLE_SCHEMA_V1,DATABASE_SCHEMA} from '../src/domain/ports/SchemaRepository.js';
const router=createApiRouter(), call=(group,action,apiVersion='v1')=>router.dispatch({apiVersion,group,action,payload:{}},'POST');
assert.equal(call('system','health').ok,true);
assert.equal(call('vehicles','lookup').ok,false);
assert.equal(call('system','health','v2').ok,false);
assert.equal(call('__proto__','foo').ok,false);
assert.equal(router.dispatch({apiVersion:'v1',group:'system',action:'health',payload:'bad'},'POST').ok,false);
assert.equal(router.dispatch({apiVersion:'v1',group:'system',action:'health',payload:{role:'admin'}},'POST').data.status,'bootstrap');
const tabs=Object.fromEntries(Object.entries(VEHICLE_SCHEMA_V1).map(([n,h])=>[n,[...h]]));
function fakeSheet(name) {return{
  getName(){return name;},
  getLastColumn(){return tabs[name].length;},
  getRange(r,c,n,w){assert.equal(r,1);assert.equal(c,1);assert.equal(n,1);assert.equal(w,tabs[name].length);return{getDisplayValues(){return [[...tabs[name]]];}};}
};}
const fakeSheets={openById(id){assert.equal(id,'test-sheet-id');return{getSheets(){return Object.keys(tabs).map(fakeSheet);}};}};
const repo=createSheetsSchemaRepository(fakeSheets,'test-sheet-id');
assert.equal(verifySchemaUseCase(repo).ok,true);
tabs.vc_vehicles.push('parking_zone');
let diff=compareSchema(DATABASE_SCHEMA,tabs);
assert.equal(diff.match,false);
assert.equal(diff.changes.some(c=>c.kind==='UNDECLARED_COLUMN'&&c.column==='parking_zone'),true);
assert.equal(verifySchemaUseCase(repo).ok,false);
const proposal=proposeSchemaChanges(diff);
assert.equal(proposal.automaticMigration,false);
assert.equal(proposal.changes[0].approval,'PENDING');
assert.equal(proposal.changes[0].inferredType,null);
tabs.vc_vehicles.pop();
const reordered=[...tabs.vc_vehicles];
[reordered[0],reordered[1]]=[reordered[1],reordered[0]];
assert.equal(compareSchema(DATABASE_SCHEMA,{...tabs,vc_vehicles:reordered}).changes.some(c=>c.kind==='REORDERED_COLUMNS'),true);
const duplicate=[...tabs.vc_vehicles];
duplicate[1]=duplicate[0];
assert.equal(compareSchema(DATABASE_SCHEMA,{...tabs,vc_vehicles:duplicate}).changes.some(c=>c.kind==='DUPLICATE_HEADER'),true);
tabs.vc_vehicles[0]='unknown';
assert.equal(compareSchema(DATABASE_SCHEMA,tabs).changes.some(c=>c.kind==='MISSING_COLUMN'),true);
tabs.vc_vehicles[0]='vehicle_id';
const removed=tabs.vc_vehicle_photos;delete tabs.vc_vehicle_photos;
assert.equal(compareSchema(DATABASE_SCHEMA,tabs).changes.some(c=>c.kind==='MISSING_TABLE'),true);
tabs.vc_vehicle_photos=removed;
tabs.unapproved_table=['a'];
assert.equal(compareSchema(DATABASE_SCHEMA,tabs).changes.some(c=>c.kind==='UNDECLARED_TABLE'),true);
delete tabs.unapproved_table;
const root=resolve(import.meta.dirname,'..');
const gasFiles=[
 'ENTRY$WebGet.gs',
 'ENTRY$WebPost.gs',
 'ADMIN$VerifySchema.gs',
 'ADMIN$InspectSchema.gs',
 'ADMIN$ProposeSchema.gs'
];
const mockContent={MimeType:{JSON:'JSON'},createTextOutput(v){return {value:v,setMimeType(){return this;}};}};
function loadGAS(order){
  const ctx=vm.createContext({ContentService:mockContent,console});
  for(const file of order){
    const code=readFileSync(join(root,'dist',file),'utf8');
    assert.ok(code.split(/\r?\n/).length<=800,`File ${file} exceeds 800 lines`);
    new vm.Script(code,{filename:file}).runInContext(ctx);
  }
  return ctx;
}
// Independently scoped IIFE files must work even if GAS loads them in reverse order.
for(const order of [gasFiles,[...gasFiles].reverse()]){
 const context=loadGAS(order);
 for(const name of ['doGet','doPost','verifyVehicleSchemaFromEditor','inspectVehicleSchemaDriftFromEditor','proposeVehicleSchemaChangeFromEditor'])
   assert.equal(typeof context[name],'function');
 assert.equal(JSON.parse(context.doGet({}).value).data.status,'bootstrap');
 const denied=JSON.parse(context.doPost({postData:{contents:JSON.stringify({apiVersion:'v1',group:'vehicles',action:'lookup',payload:{role:'admin'}})}}).value);
 assert.equal(denied.ok,false);
 assert.equal(JSON.parse(context.doPost({postData:{contents:'bad json'}}).value).ok,false);
}
console.log('Canonical schema, multi-file independent GAS, drift/proposal, and fake Sheets contracts PASSED');
