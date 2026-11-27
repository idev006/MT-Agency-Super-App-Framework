// The password hash rule — ONE source for both engines (VC-ADR-046 phase 3 wave 0). Format `pbkdf2-sha256$<rounds>$<salt 32 hex>
// $<key 64 hex>`, PBKDF2-HMAC-SHA256, 32-byte key, UTF-8 password bytes, 150,000 rounds for new hashes, 100,000–900,000 accepted,
// constant-time compare. Only the PBKDF2 computation is engine-specific (`derive`): the legacy engine injects the pure-JS
// implementation (written for GAS), the Node core injects node:crypto pbkdf2 in the thread pool — the SAME bytes (measured:
// 1,375 ms vs 59 ms per hash), so every stored hash keeps working on both. `derive` may return a value or a promise; the
// hasher returns the same kind.
export const PBKDF2_ROUNDS = 150000;
export const MIN_ROUNDS = 100000;
export const MAX_ROUNDS = 900000;
const PREFIX = 'pbkdf2-sha256';

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
  if (parts.length !== 4 || parts[0] !== PREFIX || !/^[a-f0-9]{32}$/.test(parts[2]) || !/^[a-f0-9]{64}$/.test(parts[3])) return null;
  const rounds = Number(parts[1]);
  if (!Number.isSafeInteger(rounds) || rounds < MIN_ROUNDS || rounds > MAX_ROUNDS) return null;
  return {rounds, saltHex: parts[2], keyHex: parts[3]};
}

// derive(password, saltHex, rounds) -> keyHex (64 hex) | Promise; randomSaltHex() -> 32 hex
export function createPasswordHasher({derive, randomSaltHex}) {
  if (typeof derive !== 'function' || typeof randomSaltHex !== 'function') throw new Error('PASSWORD_HASHER_NOT_CONFIGURED');
  function hash(password) {
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw new Error('INVALID_PASSWORD');
    const salt = randomSaltHex();
    if (!/^[a-f0-9]{32}$/.test(salt)) throw new Error('INVALID_SALT');
    return then(derive(password, salt, PBKDF2_ROUNDS), key => PREFIX + '$' + PBKDF2_ROUNDS + '$' + salt + '$' + key);
  }
  function verify(password, stored) {
    const parsed = typeof password === 'string' ? parsePasswordHash(stored) : null;
    if (!parsed) return false;
    return then(derive(password, parsed.saltHex, parsed.rounds), key => fixedEqual(key, parsed.keyHex));
  }
  return Object.freeze({hash, verify});
}
