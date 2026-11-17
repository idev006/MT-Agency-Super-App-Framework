// Contract for a synthetic-only workbook, not the live P6 Vehicle Contact database.
// Every record is fabricated. Never use the same password in a real account.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pbkdf2Sha256} from '../src/infrastructure/security/Pbkdf2.js';
import {SANDBOX_ID,SANDBOX_PASSWORD,SANDBOX_QR_TOKEN,SANDBOX_HASHES} from './fixtures/staging-credentials.mjs';
const password=SANDBOX_PASSWORD,fixtures=SANDBOX_HASHES,token=SANDBOX_QR_TOKEN;
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
 assert.ok(src.includes("const SANDBOX_ID='"+SANDBOX_ID+"'"));
 assert.ok(src.includes("const PASSWORD='"+password+"'"));
 assert.ok(src.includes("const QR_TOKEN='deadbeef'.repeat(8)"));
 assert.ok(src.includes("SANDBOX_ID_OR_SCHEMA_GUARD_FAILED"));
});
