// VC-ADR-034 media bridge: Cloud Run asks GAS (running as the owner) to store/read/trash photos in
// the owner's Google Drive. Every request is signed with a shared secret; GAS accepts it only when
// the HMAC matches and the timestamp is within the window. Shared by both sides (pure function).
export const MEDIA_BRIDGE_OPS=Object.freeze(['upload','read','trash','trashAll','list']);
export const MEDIA_BRIDGE_WINDOW_MS=5*60*1000;
const hex=bytes=>Array.from(bytes,x=>(x&255).toString(16).padStart(2,'0')).join('');
export function mediaBridgeSignature({utilities,secret,op,ts,args}){
 const body=hex(utilities.computeDigest(utilities.DigestAlgorithm.SHA_256,JSON.stringify(args),utilities.Charset.UTF_8));
 return hex(utilities.computeHmacSha256Signature(op+'\n'+ts+'\n'+body,secret));
}
export function sameSignature(a,b){
 if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
 let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
}
