// deriveSecret(purpose) = hex HMAC-SHA256(key = the auth pepper, 'derived:' + purpose) — byte-for-byte the legacy
// security.deriveSecret (backend/gas/src/infrastructure/security/GasSecurity.js; on Cloud Run its HMAC is node:crypto with
// the same P6VC_AUTH_PEPPER), so a value derived by either engine is the same. No pepper → null (the operations needing it
// refuse with AUTH_PEPPER_NOT_CONFIGURED). The pepper is read from the environment by name only, never logged.
import {createHmac} from 'node:crypto';

export function createDeriveSecret(pepper) {
  if (typeof pepper !== 'string' || pepper.length < 32) return null;
  return purpose => {
    if (typeof purpose !== 'string' || !purpose || purpose.length > 500) throw new Error('INVALID_SECRET_PURPOSE');
    return createHmac('sha256', pepper).update('derived:' + purpose).digest('hex');
  };
}
