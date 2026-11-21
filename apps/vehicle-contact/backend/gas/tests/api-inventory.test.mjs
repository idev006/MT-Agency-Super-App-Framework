import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../../../contracts/',import.meta.url);
const inventory=JSON.parse(readFileSync(new URL('api-inventory.v1.json',root),'utf8'));
const permissions=JSON.parse(readFileSync(new URL('api-permissions.v1.json',root),'utf8'));
const operations=inventory.operations.map(x=>x.group+'.'+x.action);
assert.equal(operations.length,52);
assert.equal(new Set(operations).size,operations.length,'duplicate operation');
assert.equal(new Set(inventory.operations.map(x=>x.id)).size,operations.length,'duplicate ID');
assert.deepEqual(permissions.operations.map(x=>x.operation),operations);
for(const op of inventory.operations){
 assert.equal(op.implementationVerified,false);
 assert.equal(op.integrationVerified,false);
 assert.equal(op.liveVerified,false);
}
for(const policy of permissions.operations){
 assert.equal(policy.enabled,false);
 assert.ok(['PUBLIC','SERVER_VERIFIED_SESSION','SERVER_VERIFIED_CAMPAIGN'].includes(policy.identitySource));
 if(policy.identitySource==='PUBLIC')assert.equal(policy.operation,'system.health');
}
console.log('API inventory and permission matrix SSOT consistency PASSED');
