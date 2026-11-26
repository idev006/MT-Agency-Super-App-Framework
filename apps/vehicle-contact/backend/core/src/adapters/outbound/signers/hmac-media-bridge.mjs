// VC-ADR-034 bridge signature on Node. The signature FORMAT has one source — mediaBridgeSignature() shared with the GAS
// side; this file only gives it the two digest functions it needs, from node:crypto.
import {createHash, createHmac} from 'node:crypto';
import {mediaBridgeSignature} from '../../../../../gas/src/infrastructure/media/MediaBridgeSignature.js';

const nodeUtilities = Object.freeze({
  DigestAlgorithm: {SHA_256: 'sha256'}, Charset: {UTF_8: 'utf8'},
  computeDigest: (_alg, text) => [...createHash('sha256').update(text, 'utf8').digest()],
  computeHmacSha256Signature: (text, secret) => [...createHmac('sha256', secret).update(text, 'utf8').digest()]
});

export const signMediaBridge = ({secret, op, ts, args}) => mediaBridgeSignature({utilities: nodeUtilities, secret, op, ts, args});
