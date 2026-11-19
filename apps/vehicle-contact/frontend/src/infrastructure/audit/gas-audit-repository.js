function mapRows(value) { if (!Array.isArray(value)) throw Object.assign(new Error('Invalid audit response'), { code: 'INVALID_ENVELOPE' }); return value.map((row) => ({ type: row.type || '', eventId: row.eventId || '', actorId: row.actorId || '', entityId: row.entityId || row.vehicleId || '', action: row.action || '', at: row.at || '' })) }
export function createGasAuditRepository({ callOperation }) { return Object.freeze({
  async query(payload) { const response = await callOperation('audit.query', payload); return { rows: mapRows(response.data), requestId: response.requestId } },
  async exportJson(payload) { const response = await callOperation('audit.export', payload); if (response.data?.format !== 'JSON') throw Object.assign(new Error('Invalid audit export'), { code: 'INVALID_ENVELOPE' }); return { rows: mapRows(response.data.rows), requestId: response.requestId } },
}) }
