// Cloud Run runtime for the P6VC API (VC-ADR-033). Runs the UNCHANGED application
// (backend/gas/src: Router/Controller/UseCases/FirestoreStore) by giving it GAS-shaped services
// built from Node + environment variables:
// - Script Properties  -> environment (pepper comes from Secret Manager, mounted as an env var)
// - UrlFetchApp        -> synchronous fetch (worker thread)
// - Firestore token    -> the Cloud Run service identity (metadata server); no key file exists.
//                         The gateway still signs a JWT for the token endpoint, so a throwaway
//                         RSA key generated at start-up is used, and the token request is
//                         answered by the metadata server instead.
// - Utilities          -> node:crypto
// - CacheService       -> none. A per-instance cache cannot be revoked across instances, which
//                         would break immediate logout/revocation (VC-ADR-030/033).
// - DriveApp           -> not configured yet (photos move to Cloud Storage in a later slice).
import {createHash, createHmac, createSign, generateKeyPairSync, randomUUID} from 'node:crypto';
import {createApplication} from '../gas/src/composition/Container.js';
import {createSyncFetch} from './sync-fetch.mjs';

export const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const METADATA_TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const signed = buf => Array.from(buf, x => (x > 127 ? x - 256 : x));

export function nodeUtilities() {
  return {
    getUuid: randomUUID,
    DigestAlgorithm: {SHA_256: 'SHA_256'},
    Charset: {UTF_8: 'UTF_8'},
    computeDigest: (algo, data) => signed(createHash('sha256').update(String(data), 'utf8').digest()),
    computeHmacSha256Signature: (value, key) => signed(createHmac('sha256', String(key)).update(String(value)).digest()),
    computeRsaSha256Signature: (message, pem) => signed(createSign('RSA-SHA256').update(String(message)).sign(pem)),
    base64EncodeWebSafe: data => (typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data.map(x => x & 255))).toString('base64url'),
    base64Encode: bytes => Buffer.from(Array.from(bytes, x => x & 255)).toString('base64'),
    base64Decode: s => signed(Buffer.from(String(s), 'base64')),
    newBlob(data, mime, name) {
      const bytes = typeof data === 'string' ? signed(Buffer.from(data, 'utf8')) : data;
      return {getBytes: () => bytes, getContentType: () => mime, getName: () => name};
    },
  };
}

// Answers the gateway's JWT token exchange with the service identity's token.
export function withMetadataToken(fetchSync) {
  return {
    fetch(url, opts = {}) {
      if (String(url) !== TOKEN_ENDPOINT) return fetchSync(url, opts);
      return fetchSync(METADATA_TOKEN_URL, {method: 'get', headers: {'Metadata-Flavor': 'Google'}});
    },
  };
}

export function runtimeProperties(env) {
  const required = ['P6VC_AUTH_PEPPER', 'FIRESTORE_PROJECT_ID'];
  for (const name of required) if (!env[name]) throw new Error('MISSING_ENV_' + name);
  const {privateKey} = generateKeyPairSync('rsa', {modulusLength: 2048, privateKeyEncoding: {type: 'pkcs8', format: 'pem'}, publicKeyEncoding: {type: 'spki', format: 'pem'}});
  const props = {
    VEHICLE_API_ENABLED: 'true',
    VEHICLE_PERSISTENCE_BACKEND: 'firestore',
    VEHICLE_FIRESTORE_SA_KEY: JSON.stringify({type: 'service_account', client_email: env.RUNTIME_SA_EMAIL || `p6vc-api-runtime@${env.FIRESTORE_PROJECT_ID}.iam.gserviceaccount.com`, private_key: privateKey, project_id: env.FIRESTORE_PROJECT_ID}),
    VEHICLE_FIRESTORE_PROJECT_ID: env.FIRESTORE_PROJECT_ID,
    VEHICLE_FIRESTORE_DATABASE_ID: env.FIRESTORE_DATABASE_ID || '(default)',
    VEHICLE_AUTH_PEPPER: env.P6VC_AUTH_PEPPER,
  };
  return {
    getScriptProperties: () => ({
      getProperty: k => (k in props ? props[k] : null),
      getProperties: () => ({...props}),
      setProperty() { throw new Error('READ_ONLY_RUNTIME_CONFIG'); },
      deleteProperty() { throw new Error('READ_ONLY_RUNTIME_CONFIG'); },
    }),
  };
}

export function createCloudRunApplication({env = process.env, fetchSync} = {}) {
  const transport = fetchSync || createSyncFetch().fetch;
  return createApplication({
    propertiesService: runtimeProperties(env),
    utilities: nodeUtilities(),
    urlFetchApp: withMetadataToken(transport),
    driveApp: null,
    cache: null,
  });
}
