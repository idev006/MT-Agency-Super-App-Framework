import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createAcceptanceHarness,assertOk,assertError,SAMPLE_PASSWORD} from './acceptance-fixture.mjs';

// Count verifyPassword invocations and capture the stored hash each call receives.
function spyVerify(h){const calls=[];const orig=h.security.verifyPassword;h.security.verifyPassword=(p,stored)=>{calls.push(stored);return orig(p,stored);};return calls;}
const DUMMY_RE=/^pbkdf2-sha256\$150000\$[a-f0-9]{32}\$[a-f0-9]{64}$/;

test('LOGIN-CONST-01: unknown username still performs one password verification (dummy hash)',()=>{
 const h=createAcceptanceHarness(),calls=spyVerify(h);
 assertError(assert,h.call('auth.login',{username:'no-such-user',password:SAMPLE_PASSWORD}),'INVALID_CREDENTIALS','unknown user');
 assert.equal(calls.length,1,'verifyPassword must run exactly once even for an unknown username');
 assert.match(calls[0],DUMMY_RE,'unknown user is verified against a real-cost dummy hash');
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
 assert.match(calls[0],DUMMY_RE,'inactive user is verified against the dummy hash');
});

test('LOGIN-CONST-04: valid credentials perform one verification and succeed',()=>{
 const h=createAcceptanceHarness(),calls=spyVerify(h);
 const r=assertOk(assert,h.call('auth.login',{username:'staff',password:SAMPLE_PASSWORD}),'login');
 assert.ok(r.sessionToken,'session issued');
 assert.equal(calls.length,1);
});

test('LOGIN-CONST-05: dummy hash cost matches GasSecurity.hashPassword (drift guard)',async()=>{
 // the round count of new hashes comes from the ONE hash rule (application/security/PasswordHash.js)
 const {PBKDF2_ROUNDS:realRounds,MIN_ROUNDS,MAX_ROUNDS}=await import('../src/application/security/PasswordHash.js');
 // the dummy hash lives with the login flow (application/flows/AuthFlows.js)
 const {DUMMY_PASSWORD_HASH}=await import('../src/application/flows/AuthFlows.js');
 const dummyRounds=Number(DUMMY_PASSWORD_HASH.split('$')[1]);
 assert.ok(Number.isSafeInteger(realRounds)&&realRounds>=MIN_ROUNDS&&realRounds<=MAX_ROUNDS,'real rounds within verifyPassword acceptance range');
 assert.equal(dummyRounds,realRounds,'dummy hash must use the same PBKDF2 cost as real hashes');
});