import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {benchmarkStagingPasswordHash} from '../src/infrastructure/security/HashDiagnostics.js';
const encode=t=>Buffer.from(t,'utf8');
const utils={
 newBlob(value){return{getBytes(){return [...encode(value)].map(x=>x>127?x-256:x)}};},
 computeDigest(_,value){return [...createHash('sha256').update(String(value)).digest()].map(x=>x>127?x-256:x);},
 computeHmacSha256Signature(value,key){
  return [...createHmac('sha256',encode(key)).update(typeof value==='string'?encode(value):Buffer.from(value)).digest()].map(x=>x>127?x-256:x);
 },
 getUuid(){return 'f971dc61-7cc0-43da-af65-7c94d7230fbb';},
 Charset:{UTF_8:'UTF_8'},DigestAlgorithm:{SHA_256:'SHA_256'}
};
const props={getScriptProperties(){return{getProperty(k){return k==='VEHICLE_AUTH_PEPPER'?'only-test-pepper-string-of-at-least-32-chars-long':null;}}}};
let t=0;
const result=benchmarkStagingPasswordHash({utilities:utils,propertiesService:props,time:()=>{t+=111;return t}});
assert.equal(result.verified,true);
assert.equal(result.accountChanged,false);
assert.equal(result.iterations,150000);
assert.equal(result.hashMillis,111);
assert.equal(result.verifyMillis,111);
for(const forbidden of ['password','salt','pepper','hash','digest','token','user_id']){
 assert.equal(Object.keys(result).includes(forbidden),false,'Credential-bearing field in benchmark response: '+forbidden);
}
const out=JSON.stringify(result);
assert.ok(!out.includes('P6VC-SYNTHETIC-NOT-A-USER-2026'));
assert.ok(!out.includes('only-test-pepper'));
console.log('GAS Editor hash diagnostic uses synthetic data and exposes only timings PASSED');
