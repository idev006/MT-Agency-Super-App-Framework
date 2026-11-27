import {pbkdf2Sha256} from './Pbkdf2.js';
import {createPasswordHasher,fixedEqual} from '../../application/security/PasswordHash.js';
// GAS cryptography adapter; secrets are Script Properties, never browser-supplied.
export function createGasSecurity({utilities,urlFetchApp,propertiesService,clock}) {
 const props=propertiesService.getScriptProperties();
 const pepper=props.getProperty('VEHICLE_AUTH_PEPPER');
 if(!pepper||pepper.length<32)throw new Error('AUTH_PEPPER_NOT_CONFIGURED');
 const hex=bytes=>Array.from(bytes,x=>(x&255).toString(16).padStart(2,'0')).join('');
 const bytes=hexString=>Array.from({length:hexString.length/2},(_,i)=>parseInt(hexString.slice(i*2,i*2+2),16));
 function sha256(value){return hex(utilities.computeDigest(utilities.DigestAlgorithm.SHA_256,String(value),utilities.Charset.UTF_8));}
 function mac(value,key){return utilities.computeHmacSha256Signature(value,key);}
 function secretToken(){return hex(mac(utilities.getUuid()+':'+utilities.getUuid()+':'+clock(),pepper));}
 function deriveSecret(purpose){
  if(typeof purpose!=='string'||!purpose||purpose.length>500)throw new Error('INVALID_SECRET_PURPOSE');
  return hex(mac('derived:'+purpose,pepper));
 }
 // PBKDF2-HMAC-SHA256 with pure JS inner rounds to avoid slow GAS service calls.
 function pbkdf2(password,saltHex,iterations){
  const key=utilities.newBlob(password).getBytes();
  return hex(pbkdf2Sha256(key,bytes(saltHex),iterations));
 }
 // the hash rule lives in application/security/PasswordHash.js (one source with the Node core); here only the GAS-safe
 // pure-JS PBKDF2, the salt source and HMAC. VEHICLE_PASSWORD_PEPPER is set ONLY on Cloud Run (from the p6vc-auth-pepper
 // secret, like the core): there new hashes are peppered; GAS (no such property) keeps the plain format.
 const passwords=createPasswordHasher({derive:pbkdf2,randomSaltHex:()=>secretToken().slice(0,32),
  pepper:props.getProperty('VEHICLE_PASSWORD_PEPPER')||null,hmacHex:(key,text)=>hex(utilities.computeHmacSha256Signature(String(text),String(key)))});
 const hashPassword=password=>passwords.hash(password);
 const verifyPassword=(password,stored)=>passwords.verify(password,stored);
 const passwordNeedsRehash=stored=>passwords.needsRehash(stored);
 function verifyGoogle(idToken) {
  const audience=props.getProperty('VEHICLE_GOOGLE_CLIENT_ID');
  if(!audience)throw new Error('GOOGLE_OIDC_NOT_CONFIGURED');
  if(typeof idToken!=='string'||idToken.length<100||idToken.length>12000)throw new Error('INVALID_GOOGLE_TOKEN');
  const url='https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(idToken);
  const response=urlFetchApp.fetch(url,{muteHttpExceptions:true});
  if(response.getResponseCode()!==200)throw new Error('INVALID_GOOGLE_TOKEN');
  const claims=JSON.parse(response.getContentText());
  if(claims.aud!==audience||!['accounts.google.com','https://accounts.google.com'].includes(claims.iss)
   ||!claims.sub||claims.email_verified!==true&&claims.email_verified!=='true'
   ||!Number.isFinite(Number(claims.exp))||Number(claims.exp)*1000<=Date.parse(clock()))
   throw new Error('INVALID_GOOGLE_TOKEN');
  return {sub:String(claims.sub)};
 }
 return Object.freeze({sha256,secretToken,deriveSecret,hashPassword,verifyPassword,passwordNeedsRehash,verifyGoogle,fixedEqual,now:clock});
}
