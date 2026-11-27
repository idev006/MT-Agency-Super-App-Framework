// Password hashing for the Node core (VC-ADR-046 phase 3 wave 0): the ONE hash rule (gas/src/application/security/PasswordHash.js)
// with node:crypto PBKDF2 in libuv's thread pool — async, so a login never blocks the other requests on the instance.
// Same bytes as the legacy pure-JS PBKDF2 (59 ms vs 1,375 ms per hash): hashes written by either engine verify on both.
import {pbkdf2, randomBytes} from 'node:crypto';
import {promisify} from 'node:util';
import {createPasswordHasher} from '../../../../gas/src/application/security/PasswordHash.js';

const pbkdf2Async = promisify(pbkdf2);
export const createNodePasswordHasher = () => createPasswordHasher({
  derive: async (password, saltHex, rounds) => (await pbkdf2Async(Buffer.from(password, 'utf8'), Buffer.from(saltHex, 'hex'), rounds, 32, 'sha256')).toString('hex'),
  randomSaltHex: () => randomBytes(16).toString('hex')
});
