import assert from 'node:assert/strict';
import { auditApiInventory } from '../src/domain/policies/ApiInventoryGate.js';
const sample={operations:[{group:'system',action:'health'}]};
assert.equal(auditApiInventory(sample,['system.health']).implementedCount,1);
assert.equal(auditApiInventory(sample,['system.health']).ready,false);
assert.deepEqual(auditApiInventory(sample,[]).missing,['system.health']);
console.log('PASS: API inventory gate assertions');
