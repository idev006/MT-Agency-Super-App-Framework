// The password hash rule — ONE source for both engines (VC-ADR-046 phase 3). Two formats, both verified everywhere they can be:
//   peppered (new, owner 2026-11-27 "Pepper + fewer rounds"):  pbkdf2-sha256-p1$<rounds>$<salt 32 hex>$<key 64 hex>
//       key = PBKDF2-HMAC-SHA256(HMAC-SHA256(pepperKey, password), salt, rounds); 60,000 rounds for new hashes (2.5x faster
//       than 150,000). pepperKey = HMAC-SHA256(pepper secret, 'p6vc-password-pepper-v1') — the secret lives in Secret Manager,
//       never in Firestore, so a leaked users table alone cannot be cracked at all.
//   plain (legacy):  pbkdf2-sha256$<rounds>$<salt>$<key>, 150,000 rounds; still verified; upgraded to peppered at the next
//       successful login (needsRehash). An engine without the pepper (GAS) keeps writing the plain format.
// Engine-specific parts are injected: derive (PBKDF2: pure JS on GAS / legacy, node:crypto in the core — same bytes), the salt
// source and hmacHex (HMAC-SHA256 hex). `derive` may return a value or a promise; the hasher returns the same kind.
// verify(password, null) = the dummy check for an unknown / inactive user: the same work as a real verify, always false.
export const PBKDF2_ROUNDS = 150000;   // plain format: new hashes where no pepper is configured
export const PEPPERED_ROUNDS = 60000;  // peppered format: new hashes
export const MIN_ROUNDS = 100000, MIN_PEPPERED_ROUNDS = 30000, MAX_ROUNDS = 900000;
export const PEPPER_PURPOSE = 'p6vc-password-pepper-v1';
const PLAIN = 'pbkdf2-sha256', PEPPERED = 'pbkdf2-sha256-p1';

const then = (v, f) => (v && typeof v.then === 'function' ? v.then(f) : f(v));
export function fixedEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let difference = 0; for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
// null when the stored value is not a hash this rule accepts
export function parsePasswordHash(stored) {
  if (typeof stored !== 'string') return null;
  const parts = stored.split('$');
  if (parts.length !== 4 || ![PLAIN, PEPPERED].includes(parts[0]) || !/^[a-f0-9]{32}$/.test(parts[2]) || !/^[a-f0-9]{64}$/.test(parts[3])) return null;
  const peppered = parts[0] === PEPPERED, rounds = Number(parts[1]);
  if (!Number.isSafeInteger(rounds) || rounds < (peppered ? MIN_PEPPERED_ROUNDS : MIN_ROUNDS) || rounds > MAX_ROUNDS) return null;
  return {peppered, rounds, saltHex: parts[2], keyHex: parts[3]};
}

// derive(password, saltHex, rounds) -> keyHex | Promise; randomSaltHex() -> 32 hex; pepper: the secret (optional);
// hmacHex(key, text) -> 64 hex (needed with a pepper)
export function createPasswordHasher({derive, randomSaltHex, pepper = null, hmacHex = null}) {
  if (typeof derive !== 'function' || typeof randomSaltHex !== 'function') throw new Error('PASSWORD_HASHER_NOT_CONFIGURED');
  const hasPepper = typeof pepper === 'string' && pepper.length > 0;
  if (hasPepper && (pepper.length < 32 || typeof hmacHex !== 'function')) throw new Error('PASSWORD_PEPPER_NOT_CONFIGURED');
  const pepperKey = hasPepper ? hmacHex(pepper, PEPPER_PURPOSE) : null;
  const pepperOf = password => hmacHex(pepperKey, password);
  const [format, rounds] = hasPepper ? [PEPPERED, PEPPERED_ROUNDS] : [PLAIN, PBKDF2_ROUNDS];
  const dummy = format + '$' + rounds + '$' + '0'.repeat(32) + '$' + '0'.repeat(64); // the cost of a new hash on this engine
  function hash(password) {
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw new Error('INVALID_PASSWORD');
    const salt = randomSaltHex();
    if (!/^[a-f0-9]{32}$/.test(salt)) throw new Error('INVALID_SALT');
    return then(derive(hasPepper ? pepperOf(password) : password, salt, rounds), key => format + '$' + rounds + '$' + salt + '$' + key);
  }
  function verify(password, stored) {
    if (typeof password !== 'string') return false;
    const parsed = parsePasswordHash(stored === null || stored === undefined ? dummy : stored);
    if (!parsed || (parsed.peppered && !hasPepper)) return false; // a peppered hash cannot be checked without the pepper
    const isDummy = stored === null || stored === undefined;
    return then(derive(parsed.peppered ? pepperOf(password) : password, parsed.saltHex, parsed.rounds), key => !isDummy && fixedEqual(key, parsed.keyHex));
  }
  // a valid stored hash that is not in this engine's current format / cost → rewrite it after a successful login
  function needsRehash(stored) {
    const parsed = parsePasswordHash(stored);
    return !!parsed && hasPepper && (!parsed.peppered || parsed.rounds !== PEPPERED_ROUNDS);
  }
  return Object.freeze({hash, verify, needsRehash, peppered: hasPepper});
}
