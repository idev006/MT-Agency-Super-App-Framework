// Domain-only QR policy. Crypto source and SHA-256 digest are injected by trusted adapters.
// No plaintext token is stored in Sheets; no public API is enabled by this module.
export function issueQrToken({randomBytes,sha256}) {
  if(typeof randomBytes!=='function' || typeof sha256!=='function')
    throw new Error('Trusted cryptography adapter required');
  const entropy=randomBytes(32);
  if(!entropy || entropy.length!==32 || typeof entropy[Symbol.iterator]!=='function')
    throw new Error('Expected 32 cryptographically random bytes');
  const bytes=Array.from(entropy);
  if(bytes.some(v=>!Number.isInteger(v)||v<0||v>255))throw new Error('Invalid entropy bytes');
  const hex=bytes.map(v=>v.toString(16).padStart(2,'0')).join('');
  const digest=sha256(hex);
  if(typeof digest!=='string' || !/^[a-f0-9]{64}$/i.test(digest))
    throw new Error('Invalid SHA-256 digest');
  return {token:hex,token_digest:digest.toLowerCase()};
}
