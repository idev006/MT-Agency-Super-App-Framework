import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const inventory=JSON.parse(fs.readFileSync(new URL('../../../contracts/api-inventory.v1.json',import.meta.url),'utf8'));
const source=fs.readFileSync(new URL('../scripts/run-live-owner-dev-regression.mjs',import.meta.url),'utf8');
const loginSource=fs.readFileSync(new URL('../scripts/login-http-acceptance.mjs',import.meta.url),'utf8');
const suiteSource=fs.readFileSync(new URL('../scripts/run-live-api-suite.mjs',import.meta.url),'utf8');
const smokeSource=fs.readFileSync(new URL('../scripts/smoke-api.mjs',import.meta.url),'utf8');
const liveWorkflow=fs.readFileSync(new URL('../../../../../.github/workflows/p6vc-live-acceptance.yml',import.meta.url),'utf8');

test('owner development runner statically covers every API inventory operation',()=>{
 const operations=inventory.operations.map(x=>x.group+'.'+x.action);
 const missing=operations.filter(operation=>!source.includes("'"+operation+"'"));
 assert.equal(operations.length,59);
 assert.deepEqual(missing,[]);
});

test('owner development runner requires explicit write gate and restores fixtures',()=>{
 for(const marker of [
  "P6VC_ALLOW_OWNER_DEV_WRITES",
  "RUN_SYNTHETIC_OWNER_DEV",
  "VEHICLE_CANCEL",
  "CAMPAIGN_REVOKE",
  "ORGANIZATION_DISABLE",
  "USER_SUSPEND_",
  "AUTOMATION_ADMIN_LOGOUT",
  "SIGTERM",
  "persistReport"
 ])assert.ok(source.includes(marker),marker);
 assert.ok(!source.includes('state.tokens.sys'),'vehicles.list must use the authenticated admin token');
 assert.ok(source.indexOf("cleanup('VEHICLE_CANCEL'")<source.indexOf("cleanup('CAMPAIGN_REVOKE'"));
 assert.ok(source.indexOf("cleanup('VEHICLE_CANCEL'")<source.indexOf("cleanup('USER_SUSPEND_'"));
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

test('single-admin acceptance declares the expected password lifecycle without exposing credentials',()=>{
 for(const marker of ['P6VC_EXPECT_PASSWORD_STATE',"['changed','initial']",'PASSWORD_CHANGE_STATE_MISMATCH','ACTIVE_PERMISSIONS_MISSING'])
  assert.ok(loginSource.includes(marker),marker);
 for(const marker of ['expected_password_state:','- changed','- initial','P6VC_EXPECT_PASSWORD_STATE:'])
  assert.ok(liveWorkflow.includes(marker),marker);
 const passwordBindings=liveWorkflow.split(/\r?\n/).filter(line=>line.includes('P6VC_HTTP_LOGIN_PASSWORD:'));
 assert.ok(passwordBindings.length>=2);
 assert.ok(passwordBindings.every(line=>line.includes('${{ secrets.P6VC_HTTP_LOGIN_PASSWORD }}')));
});

test('one-command API suite gates authenticated writes behind safe preflight and explicit credentials',()=>{
 for(const marker of [
  'PUBLIC_DIRECT_GAS','WORKER_FAIL_CLOSED','AUTHENTICATED_FULL_INVENTORY',
  'SAFE_PREFLIGHT_FAILED','MISSING_TEST_CREDENTIALS','MISSING_WRITE_CONFIRMATION',
  'PASS_PUBLIC_ONLY','p6vc-live-api-suite.json','GITHUB_STEP_SUMMARY'
 ])assert.ok(suiteSource.includes(marker),marker);
 assert.ok(suiteSource.indexOf("runStage('PUBLIC_DIRECT_GAS'")<suiteSource.indexOf("runStage('AUTHENTICATED_FULL_INVENTORY'"));
 assert.ok(suiteSource.indexOf("runStage('WORKER_FAIL_CLOSED'")<suiteSource.indexOf("runStage('AUTHENTICATED_FULL_INVENTORY'"));
 assert.ok(suiteSource.includes("process.argv.includes('--require-authenticated')"));
 assert.ok(suiteSource.includes("suite.cleanup=(authenticated.status==='PASS'||authenticated.status==='FAIL')&&ownerReport"),'failed authenticated runs must retain cleanup evidence');
 assert.ok(smokeSource.includes('p6vc-live-public-smoke.json'));
});

test('manual full-suite workflow is owner-confirmed and binds only protected test secrets',()=>{
 for(const marker of ['full-api-suite','RUN_FULL_API_SUITE','--require-authenticated',
  'secrets.P6VC_TEST_USERNAME','secrets.P6VC_TEST_PASSWORD','p6vc-live-api-suite-evidence'])
  assert.ok(liveWorkflow.includes(marker),marker);
 const fullStep=liveWorkflow.split('- name: Full public, Worker and guarded authenticated API suite')[1].split('- name:')[0];
 assert.ok(fullStep.includes('P6VC_ALLOW_OWNER_DEV_WRITES: RUN_SYNTHETIC_OWNER_DEV'));
 assert.ok(!fullStep.includes('P6VC_HTTP_LOGIN_PASSWORD'));
});
