// Ports (VC-ADR-046 / NODE_CORE_ARCHITECTURE §3): what the use cases need from the outside, as interfaces only.
// Adapters implement them; use cases import nothing else from outside the domain. All methods return promises.
export const PORTS = Object.freeze({
  // the legacy engine answers operations the core has not ported yet (phase 1–8)
  LegacyEngine: ['dispatch'],                 // dispatch(envelope, method) -> envelope
  // photo files (owner's Drive through the GAS bridge, VC-ADR-034)
  MediaStore: ['upload', 'read', 'trash', 'trashAll', 'list'], // upload(base64, mime) -> {storageRef}; read(ref) -> {base64Image, mime_type}; trash(ref) -> boolean;
  //   list(pageToken|null) -> {files: [{id, createdMs, trashed}], nextPageToken|null} (housekeeping, phase 2c)
});

// Fails fast when an adapter does not implement its port (used by the Integration Manager and the tests).
export function assertImplements(port, adapter) {
  const methods = PORTS[port];
  if (!methods) throw new Error('UNKNOWN_PORT:' + port);
  const missing = methods.filter(m => typeof adapter?.[m] !== 'function');
  if (missing.length) throw new Error(`PORT_NOT_IMPLEMENTED:${port}:${missing.join(',')}`);
  return adapter;
}
