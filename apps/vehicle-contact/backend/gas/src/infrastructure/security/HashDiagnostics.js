import {createGasSecurity} from './GasSecurity.js';

// GAS Editor-only synthetic diagnostic. No credential, digest, pepper or PII in output.
export function benchmarkStagingPasswordHash({utilities,propertiesService,time=()=>Date.now()}) {
 const security=createGasSecurity({
  utilities,propertiesService,urlFetchApp:null,
  clock:()=>new Date().toISOString()
 });
 const sample='P6VC-SYNTHETIC-NOT-A-USER-2026';
 const start=time();
 const hashed=security.hashPassword(sample);
 const hashMillis=time()-start;
 const verifyStarted=time();
 if(!security.verifyPassword(sample,hashed))throw new Error('PASSWORD_HASH_SELF_TEST_FAILED');
 const verifyMillis=time()-verifyStarted;
 return Object.freeze({
  algorithm:'pbkdf2-sha256',iterations:150000,
  hashMillis,verifyMillis,verified:true,accountChanged:false,
  note:'Editor-only synthetic benchmark; not a login or production security certificate'
 });
}
