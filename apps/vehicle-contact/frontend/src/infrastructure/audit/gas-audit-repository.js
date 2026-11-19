import { callPaginatedOperation, mapPaginatedData } from '../api/pagination-contract.js'
function mapRow(row) { return { type: row.type || '', eventId: row.eventId || '', actorId: row.actorId || '', entityId: row.entityId || row.vehicleId || '', action: row.action || '', at: row.at || '' } }
function mapRows(value) { if (!Array.isArray(value)) throw Object.assign(new Error('Invalid audit response'), { code: 'INVALID_ENVELOPE' }); return value.map(mapRow) }
export function createGasAuditRepository({ callOperation }) { return Object.freeze({
  async query({ page = 1, pageSize = 10, ...payload }) { const response = await callPaginatedOperation({ callOperation, operation: 'audit.query', payload, page, pageSize }); const result = mapPaginatedData(response.data, mapRow); return { rows: result.items, pagination: result.pagination, requestId: response.requestId } },
  async exportJson(payload) { const response = await callOperation('audit.export', payload); if (response.data?.format !== 'JSON') throw Object.assign(new Error('Invalid audit export'), { code: 'INVALID_ENVELOPE' }); return { rows: mapRows(response.data.rows), requestId: response.requestId } },
}) }
