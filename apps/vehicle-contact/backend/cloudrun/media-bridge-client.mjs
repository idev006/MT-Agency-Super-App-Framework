// Cloud Run side of the Drive media bridge (VC-ADR-034): implements the application's photo port
// (upload/read/trash, same contract as gas/src/infrastructure/media/DrivePhotos.js) by sending a
// signed request to the GAS Web App, which stores the file in the owner's Google Drive.
import {mediaBridgeSignature} from '../gas/src/infrastructure/media/MediaBridgeSignature.js';

export function createMediaBridgePhotos({fetchSync, url, secret, utilities, now = () => new Date().toISOString()}) {
  if (!url || !secret || secret.length < 32) throw new Error('MEDIA_BRIDGE_NOT_CONFIGURED');
  function call(op, args) {
    const ts = now();
    const sig = mediaBridgeSignature({utilities, secret, op, ts, args});
    const resp = fetchSync(url, {method: 'post', contentType: 'text/plain;charset=utf-8',
      payload: JSON.stringify({bridge: 'media', op, ts, args, sig})});
    let body;
    try { body = JSON.parse(resp.getContentText()); } catch { throw new Error('MEDIA_BRIDGE_BAD_RESPONSE'); }
    if (!body || body.ok !== true) throw new Error(body?.error?.code || 'MEDIA_BRIDGE_FAILED');
    return body.data;
  }
  return Object.freeze({
    upload: (base64, mime) => call('upload', {base64, mime}),
    read: storageRef => call('read', {storageRef}),
    trash: storageRef => call('trash', {storageRef}).trashed === true,
    trashAll: () => call('trashAll', {}), // VC-ADR-039 system reset: {trashed, more}
    organize: req => call('organize', req), // VC-ADR-050: {folderId}
    stat: refs => call('stat', {refs}),
  });
}
