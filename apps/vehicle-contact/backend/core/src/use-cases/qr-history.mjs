// N1b: read one vehicle and its QR rows in parallel, then resolve actor names in one round.
// The response contains QR metadata only; the code and digest never leave this use case.
const vehicleIdOf = value => {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || /^[=+@]/.test(value.trim()))
    throw new Error('INVALID_VEHICLE_ID');
  return value.trim();
};

export async function qrHistory(p, _actor, {store}) {
  const vehicleId = vehicleIdOf(p.vehicleId);
  const [vehicle, found] = await store.readMany([
    {kind: 'one', name: 'vc_vehicles', filter: {vehicle_id: vehicleId}},
    {kind: 'list', name: 'vc_qr_tokens', filter: {vehicle_id: vehicleId}}
  ]);
  if (!vehicle) throw new Error('NOT_FOUND');
  const rows = found || [];
  const userIds = [...new Set(rows.flatMap(row => [row.issued_by, row.revoked_by]).filter(Boolean))];
  const users = userIds.length ? await store.readMany(userIds.map(userId =>
    ({kind: 'one', name: 'vc_users', filter: {user_id: userId}}))) : [];
  const names = new Map(userIds.map((userId, i) => [userId, users[i]?.display_name || '']));
  const items = rows.map((row, order) => ({order, qrId: row.qr_id, status: row.status,
    issuedAt: row.issued_at || '', issuedBy: row.issued_by || '', issuedByName: names.get(row.issued_by) || '',
    reason: row.reason || '', note: row.issue_note || '', replacesQrId: row.replaces_qr_id || '',
    revokedAt: row.revoked_at || '', revokedBy: row.revoked_by || '', revokedByName: names.get(row.revoked_by) || '',
    revokeReason: row.revoke_reason || '', revokeNote: row.revoke_note || ''}))
    .sort((a, b) => String(b.issuedAt).localeCompare(String(a.issuedAt)) || b.order - a.order)
    .map(({order, ...item}) => item);
  return {vehicleId, items};
}
