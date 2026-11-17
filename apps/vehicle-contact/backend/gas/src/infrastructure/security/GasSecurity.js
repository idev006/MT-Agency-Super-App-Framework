import {pbkdf2Sha256} from './Pbkdf2.js';
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
 function fixedEqual(a,b) {
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);
  return difference===0;
 }
 // PBKDF2-HMAC-SHA256 with pure JS inner rounds to avoid slow GAS service calls.
 function pbkdf2(password,saltHex,iterations){
  const key=utilities.newBlob(password).getBytes();
  return hex(pbkdf2Sha256(key,bytes(saltHex),iterations));
 }
 function hashPassword(password){
  if(typeof password!=='string'||password.length<12||password.length>128)throw new Error('INVALID_PASSWORD');
  const salt=secretToken().slice(0,32),iterations=150000;
  return 'pbkdf2-sha256$'+iterations+'$'+salt+'$'+pbkdf2(password,salt,iterations);
 }
 function verifyPassword(password,stored) {
  if(typeof password!=='string'||typeof stored!=='string')return false;
  const parts=stored.split('$');
  if(parts.length!==4||parts[0]!=='pbkdf2-sha256'||!/^[a-f0-9]{32}$/.test(parts[2])||!/^[a-f0-9]{64}$/.test(parts[3]))return false;
  const rounds=Number(parts[1]);
  if(!Number.isSafeInteger(rounds)||rounds<100000||rounds>900000)return false;
  return fixedEqual(pbkdf2(password,parts[2],rounds),parts[3]);
 }
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
 return Object.freeze({sha256,secretToken,hashPassword,verifyPassword,verifyGoogle,fixedEqual,now:clock});
}
