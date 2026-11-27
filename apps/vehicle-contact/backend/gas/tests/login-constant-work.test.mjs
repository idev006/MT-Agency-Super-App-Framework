import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAcceptanceHarness,assertOk,assertError,SAMPLE_PASSWORD} from './acceptance-fixture.mjs';

// Count verifyPassword invocations and capture the stored hash each call receives.
function spyVerify(h){const calls=[];const orig=h.security.verifyPassword;h.security.verifyPassword=(p,stored)=>{calls.push(stored);return orig(p,stored);};return calls;}

test('LOGIN-CONST-01: unknown username still performs one password verification (dummy hash)',()=>{
 const h=createAcceptanceHarness(),calls=spyVerify(h);
 assertError(assert,h.call('auth.login',{username:'no-such-user',password:SAMPLE_PASSWORD}),'INVALID_CREDENTIALS','unknown user');
 assert.equal(calls.length,1,'verifyPassword must run exactly once even for an unknown username');
 assert.equal(calls[0],null,'unknown user gets the dummy check (verify with no stored hash = full cost, false)');
});

test('LOGIN-CONST-02: known username with wrong password performs one verification',()=>{
 const h=createAcceptanceHarness(),calls=spyVerify(h);
 assertError(assert,h.call('auth.login',{username:'staff',password:'Wrong-Password-999!'}),'INVALID_CREDENTIALS','wrong password');
 assert.equal(calls.length,1);
 assert.equal(calls[0],'test-only:'+SAMPLE_PASSWORD,'known user is verified against the stored hash');
});

test('LOGIN-CONST-03: inactive user performs one verification (dummy) and is denied',()=>{
 const h=createAcceptanceHarness();
 assertOk(assert,h.as('sys','users.suspend',{userId:'u-staff'}),'suspend staff');
 const calls=spyVerify(h);
 assertError(assert,h.call('auth.login',{username:'staff',password:SAMPLE_PASSWORD}),'INVALID_CREDENTIALS','suspended user');
 assert.equal(calls.length,1);
 assert.equal(calls[0],null,'inactive user gets the dummy check');
});

test('LOGIN-CONST-04: valid credentials perform one verification and succeed',()=>{
 const h=createAcceptanceHarness(),calls=spyVerify(h);
 const r=assertOk(assert,h.call('auth.login',{username:'staff',password:SAMPLE_PASSWORD}),'login');
 assert.ok(r.sessionToken,'session issued');
 assert.equal(calls.length,1);
});

test('LOGIN-CONST-05: the dummy check costs exactly what a new hash costs on that engine (plain and peppered)',async()=>{
 const {createPasswordHasher,PBKDF2_ROUNDS,PEPPERED_ROUNDS}=await import('../src/application/security/PasswordHash.js');
 const {createHmac}=await import('node:crypto');
 for(const pepper of [null,'p'.repeat(40)]){
  const rounds=[];
  const h=createPasswordHasher({derive:(pw,salt,n)=>{rounds.push(n);return 'a'.repeat(64);},randomSaltHex:()=>'0'.repeat(32),
   pepper,hmacHex:(k,t)=>createHmac('sha256',k).update(t).digest('hex')});
  h.hash('Synthetic-Passw0rd!');
  assert.equal(h.verify('Synthetic-Passw0rd!',null),false,'the dummy never verifies');
  assert.equal(rounds[0],pepper?PEPPERED_ROUNDS:PBKDF2_ROUNDS);
  assert.equal(rounds[1],rounds[0],'dummy rounds = new-hash rounds');
 }
});
