// Officer-path read operations as shared flows (VC-ADR-046 phase 2b): ONE source for both engines — the legacy engine runs
// them with runFlowSync, the Node core with runFlowAsync. Rules moved unchanged from VehicleOperations.js.
// Same input checks as the legacy `need` helper: a trimmed non-empty string, max 200, no spreadsheet-formula prefix.
export function need(v, name, max = 200) {
  if (typeof v !== 'string' || !v.trim() || v.length > max || /^[=+@]/.test(v.trim())) throw new Error('INVALID_' + name);
  return v.trim();
}

// vehicles.history: the vehicle's change-audit trail, the last 100 entries in insertion order.
export function* vehicleHistoryFlow(p) {
  const vehicleId = need(p.vehicleId, 'VEHICLE_ID');
  const [rows] = yield {reads: [{kind: 'list', name: 'vc_change_audit', filter: {entity_id: vehicleId}}]};
  return rows.slice(-100);
}
