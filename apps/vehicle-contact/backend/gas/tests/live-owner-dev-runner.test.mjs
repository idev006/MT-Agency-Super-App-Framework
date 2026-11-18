import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const inventory=JSON.parse(fs.readFileSync(new URL('../../../contracts/api-inventory.v1.json',import.meta.url),'utf8'));
const source=fs.readFileSync(new URL('../scripts/run-live-owner-dev-regression.mjs',import.meta.url),'utf8');

test('owner development runner statically covers every API inventory operation',()=>{
 const operations=inventory.operations.map(x=>x.group+'.'+x.action);
 const missing=operations.filter(operation=>!source.includes("'"+operation+"'"));
 assert.equal(operations.length,50);
 assert.deepEqual(missing,[]);
});

test('owner development runner requires explicit write gate and restores fixtures',()=>{
 for(const marker of [
  "P6VC_ALLOW_OWNER_DEV_WRITES",
  "RUN_SYNTHETIC_OWNER_DEV",
  "CAMPAIGN_REVOKE",
  "ORGANIZATION_DISABLE",
  "USER_SUSPEND_",
  "AUTOMATION_ADMIN_LOGOUT",
  "SIGTERM",
  "persistReport"
 ])assert.ok(source.includes(marker),marker);
});

test('owner development runner never changes or resets the administrator credential',()=>{
 assert.ok(source.includes('AUTH.SESSION.AUTOMATION_ADMIN'));
 assert.ok(!source.includes('AUTH.CHANGE_PASSWORD.ADMIN'));
 assert.ok(!source.includes('ADMIN_PASSWORD_AND_FLAG_RESTORE'));
 assert.ok(!source.includes('adminTemp'));
 assert.ok(!source.includes('adminUserId'));
});

test('owner development runner contains no credential or session literal',()=>{
 assert.ok(!source.includes('VEHICLE_BOOTSTRAP_TEMP_PASSWORD'));
 assert.ok(!source.includes('BRIDGE_ACCESS_KEY'));
 assert.ok(!/sessionToken\s*:\s*['"][A-Fa-f0-9]{32,}/.test(source));
});
