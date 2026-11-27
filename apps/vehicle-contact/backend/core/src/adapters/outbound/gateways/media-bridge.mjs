// Gateway: photo files in the owner's Google Drive through the signed GAS bridge (port MediaStore, VC-ADR-034/047).
// Same wire contract as backend/cloudrun/media-bridge-client.mjs, but async. Retries only read / trash / list (registry).
import {signMediaBridge} from '../signers/hmac-media-bridge.mjs';

export function createMediaBridgeGateway({http, secret, idempotent = [], now = () => new Date().toISOString()}) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('MEDIA_BRIDGE_NOT_CONFIGURED');
  async function call(op, args) {
    const ts = now();
    const sig = signMediaBridge({secret, op, ts, args});
    let json;
    try {
      ({json} = await http.request({method: 'POST', headers: {'content-type': 'text/plain;charset=utf-8'},
        body: JSON.stringify({bridge: 'media', op, ts, args, sig}), idempotent: idempotent.includes(op)}));
    } catch (e) { throw new Error(e?.code || 'UPSTREAM_UNAVAILABLE'); }
    if (!json || json.ok !== true) throw new Error(typeof json?.error?.code === 'string' ? json.error.code : 'MEDIA_BRIDGE_FAILED');
    return json.data;
  }
  return Object.freeze({
    upload: (base64, mime) => call('upload', {base64, mime}),
    read: storageRef => call('read', {storageRef}),
    trash: async storageRef => (await call('trash', {storageRef})).trashed === true,
    trashAll: () => call('trashAll', {}),
    list: pageToken => call('list', pageToken ? {pageToken} : {})
  });
}
