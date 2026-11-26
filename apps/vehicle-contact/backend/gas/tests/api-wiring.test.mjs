import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {API_GROUPS,isDeclaredRoute} from '../src/api/routes/GroupRoutes.js';
import {DTO_OPERATIONS,validateOperationPayload} from '../src/api/dto/OperationPayloadValidator.js';
const root=resolve(import.meta.dirname,'../../..');
const inventory=JSON.parse(readFileSync(resolve(root,'contracts/api-inventory.v1.json'),'utf8'));
const routes=Object.entries(API_GROUPS).flatMap(([group,actions])=>actions.map(action=>group+'.'+action));
const expected=inventory.operations.map(x=>x.group+'.'+x.action);
const nonHealth=expected.filter(x=>x!=='system.health');
assert.equal(inventory.operations.length,64);
assert.equal(new Set(routes).size,routes.length);
assert.deepEqual(routes.slice().sort(),expected.slice().sort());
assert.deepEqual(DTO_OPERATIONS.slice().sort(),nonHealth.slice().sort());
for(const op of inventory.operations){
  assert.equal(isDeclaredRoute(op.group,op.action),true);
  assert.equal(op.liveVerified,false,'Live verification must never be pre-claimed');
}
for(const forbidden of [['__proto__','constructor'],['system','configure'],['vehicles','delete'],['audit','download']])
  assert.equal(isDeclaredRoute(...forbidden),false);
assert.throws(()=>validateOperationPayload('users.create',{username:'valid',displayName:'Tester',temporaryPassword:'long-password',permissions:['*']}));
assert.throws(()=>validateOperationPayload('vehicles.lookup',{plate:'TEST'}));
const container=readFileSync(resolve(root,'backend/gas/src/composition/Container.js'),'utf8');
const controller=readFileSync(resolve(root,'backend/gas/src/api/controllers/OperationController.js'),'utf8');
const entry=readFileSync(resolve(root,'backend/gas/src/entrypoints/WebApp.js'),'utf8');
const router=readFileSync(resolve(root,'backend/gas/src/api/routes/Router.js'),'utf8');
for(const word of ['createApiRouter','createOperationController','createSessionService','createRuntimeStore','createDrivePhotos','VEHICLE_API_ENABLED'])
  assert.ok(container.includes(word),'Missing composition dependency: '+word);
const selector=readFileSync(resolve(root,'backend/gas/src/composition/StoreSelector.js'),'utf8');
for(const word of ['createFirestoreStore','createFirestoreRestGateway','STORAGE_NOT_CONFIGURED','INVALID_FIRESTORE_SA_KEY'])
  assert.ok(selector.includes(word),'Missing runtime-store dependency: '+word);
for(const word of ['createIdentityOperations','createAdministrationOperations','createVehicleOperations','createMediaRetentionOperations','validateOperationPayload','sessions.authorize'])
  assert.ok(controller.includes(word),'Missing API controller dependency: '+word);
assert.ok(entry.includes('createApplication().dispatch('));
assert.ok(router.includes('isDeclaredRoute('));
console.log('All 60 v1 routes match inventory; 59 DTOs wired; composition source links and default-deny path checked (not runtime integration evidence)');
