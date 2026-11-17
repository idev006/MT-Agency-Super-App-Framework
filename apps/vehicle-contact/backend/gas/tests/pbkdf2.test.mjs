import assert from 'node:assert/strict';
import {createHash,createHmac,pbkdf2Sync} from 'node:crypto';
import {pbkdf2Sha256} from '../src/infrastructure/security/Pbkdf2.js';
import {createGasSecurity} from '../src/infrastructure/security/GasSecurity.js';
const encode=s=>Buffer.from(s,'utf8');
for(const [password,salt,rounds] of [
 ['password','salt',1],['password','salt',2],['password','salt',4096],
 ['ภาษาไทย UTF8 🌻','salt-utf8',150000],['x'.repeat(100),'a'.repeat(80),1024]
]){
 const derived=Buffer.from(pbkdf2Sha256(encode(password),encode(salt),rounds));
 const expected=pbkdf2Sync(password,encode(salt),rounds,32,'sha256');
 assert.deepEqual(derived,expected,'PBKDF2 SHA-256 mismatch at rounds '+rounds);
}
assert.throws(()=>pbkdf2Sha256([],[],0),/INVALID_PBKDF2_ROUNDS/);
assert.throws(()=>pbkdf2Sha256([],[],900001),/INVALID_PBKDF2_ROUNDS/);
let hmacCalls=0;
const utilities={
 newBlob(value){return {getBytes(){return Array.from(encode(value),x=>x>127?x-256:x)}};},
 computeHmacSha256Signature(value,key){
  hmacCalls++;
  const bytes=typeof value==='string'?encode(value):Buffer.from(value);
  const mac=createHmac('sha256',typeof key==='string'?encode(key):Buffer.from(key));
  return Array.from(mac.update(bytes).digest(),x=>x>127?x-256:x);
 },
 computeDigest(_,value){return Array.from(createHash('sha256').update(String(value)).digest(),x=>x>127?x-256:x);},
 getUuid(){return 'f971dc61-7cc0-43da-af65-7c94d7230fbb';},
 Charset:{UTF_8:'UTF_8'},DigestAlgorithm:{SHA_256:'SHA_256'}
};
const props={getScriptProperties(){return {getProperty(k){return k==='VEHICLE_AUTH_PEPPER'?'staging-test-pepper-material-48characters-long':null;}}}};
const security=createGasSecurity({utilities,propertiesService:props,urlFetchApp:null,clock:()=>new Date('2026-11-17T00:00:00Z').toISOString()});
const password='Correct Horse Battery Staple! 🌻';
const stored=security.hashPassword(password);
const [algo,rounds,salt,hash]=stored.split('$');
assert.equal(algo,'pbkdf2-sha256');
assert.equal(Number(rounds),150000);
assert.equal(hash,pbkdf2Sync(password,Buffer.from(salt,'hex'),150000,32,'sha256').toString('hex'));
assert.equal(security.verifyPassword(password,stored),true);
assert.equal(security.verifyPassword('wrong password',stored),false);
assert.throws(()=>security.hashPassword('too-short'),/INVALID_PASSWORD/);
// Only the random salt/token uses the GAS Utilities bridge: no 150k service invocations.
assert.ok(hmacCalls<=2,'Unexpected GAS Utilities HMAC calls: '+hmacCalls);
console.log('PBKDF2 standard vectors, GAS security hash compatibility, 150k rounds and bounded Utilities calls PASSED');
