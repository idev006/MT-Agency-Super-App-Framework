// Candidate GAS web app for N4: only the signed Google Drive photo bridge remains.
// It is built and tested separately from the currently published GAS API/editor bundle.
import packageInfo from '../../gas/package.json' with {type: 'json'};
import {createMediaBridgeServer, isMediaBridgeRequest}
  from '../../gas/src/infrastructure/media/MediaBridgeServer.js';

const output = value => ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
const error = code => ({ok: false, requestId: null, data: null, error: {code, message: 'Request could not be completed'}});

export function doGet() {
  return output({ok: true, requestId: null, data: {service: 'p6vc-media-bridge', status: 'ready',
    bridgeVersion: packageInfo.version, releaseChannel: 'development'}, error: null});
}

export function doPost(e) {
  const contents = e?.postData?.contents;
  if (typeof contents !== 'string' || contents.length > 8 * 1024 * 1024) return output(error('BAD_REQUEST'));
  try {
    const request = JSON.parse(contents);
    if (!isMediaBridgeRequest(request)) return output(error('NOT_FOUND'));
    return output(createMediaBridgeServer({propertiesService: PropertiesService, utilities: Utilities,
      driveApp: DriveApp}).handle(request));
  } catch { return output(error('BAD_REQUEST')); }
}
