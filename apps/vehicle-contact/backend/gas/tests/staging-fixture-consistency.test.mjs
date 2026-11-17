// Contract for a synthetic-only workbook, not the live P6 Vehicle Contact database.
// Every record is fabricated. Never use the same password in a real account.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pbkdf2Sha256} from '../src/infrastructure/security/Pbkdf2.js';
const password='P6VC-Test-Only-2026-11-17!';
const fixtures=[
 ['test_sysadmin','37ae711cbbe36248dbc1a17dfc401f8e','5ed69cac2d450e858422dc758b712303def8cf206ca51f9fa70d5fbafd969e1c'],
 ['test_registration','c0840b1d7b631becca600638666c244a','dc20f5a30c1d9ad2c637755144d1bc306f67f46a64e54cc7e254051689e92a36'],
 ['test_staff','4ad10565ec2c55b2d654f2b9174fd707','3b745e146f818bd6dc1d0cd84b5a71a9da182b6fe66cabdfe643a3e71d35e2b1'],
 ['test_owner','a30514507d9575f5487d74ef845c144f','e2b8104f768b1d042cec8e543c0ea2e3898255ecff8c40d5c22239080b9718c7'],
 ['test_worker','cf1edd13453c6fd7779f0c66f3a09571','48642f2a2c5c0b9b518716ece436b2aa2c08016cfdf423bdfcab79913c5c3530'],
 ['test_firstlogin','779bc76a60e71c686460a45a34081b20','843a2c16ddd1ec6dfcb1c6c6181e3a9553c2160156c8c6a2639054a3f518e868']
];
const token='deadbeef'.repeat(8);
test('SANDBOX-FIXTURE-01 six credentials verified against Node crypto + GAS-compatible pure JS PBKDF2',()=>{
 assert.equal(fixtures.length,6);
 for(const [name,salt,hash] of fixtures){
  const native=pbkdf2Sync(password,Buffer.from(salt,'hex'),150000,32,'sha256').toString('hex');
  const engine=Buffer.from(pbkdf2Sha256(Buffer.from(password),Buffer.from(salt,'hex'),150000)).toString('hex');
  assert.equal(native,hash,'PBKDF2 fixture mismatch for '+name);
  assert.equal(engine,hash,'GAS PBKDF2 fixture mismatch for '+name);
 }
});
test('SANDBOX-FIXTURE-02 synthetic QR hash and probe constants stable',()=>{
 const digest=createHash('sha256').update(token).digest('hex');
 assert.equal(digest,'247d08f3e13938b244f5ecd8966f1778e5e72b175820f46ba86c9c039272affa');
 const src=readFileSync(new URL('../src/infrastructure/testing/StagingAcceptanceProbe.js',import.meta.url),'utf8');
 assert.ok(src.includes("const SANDBOX_ID='1kmUaBUC8slFICGLzxpNEUBsU87Sf-tnfe32AUs208As'"));
 assert.ok(src.includes("const PASSWORD='"+password+"'"));
 assert.ok(src.includes("const QR_TOKEN='deadbeef'.repeat(8)"));
 assert.ok(src.includes("SANDBOX_ID_OR_SCHEMA_GUARD_FAILED"));
});
