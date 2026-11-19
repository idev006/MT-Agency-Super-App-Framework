import { ref } from 'vue'
import { assertAuditRepository } from '../../application/audit/audit-port.js'
export function useAuditReview({ repository }) { const source = assertAuditRepository(repository); const phase = ref('idle'); const rows = ref([]); const failure = ref(null); const page = ref(1); const pageSize = ref(10); const pagination = ref({ total: 0, page: 1, pageSize: 10, totalPages: 0 }); const filters = ref({})
  async function query(payload = filters.value) { filters.value = { ...payload }; phase.value = 'loading'; failure.value = null; try { const result = await source.query({ ...filters.value, page: page.value, pageSize: pageSize.value }); if (result.pagination.totalPages > 0 && page.value > result.pagination.totalPages) { page.value = result.pagination.totalPages; return query(filters.value) }; rows.value = result.rows; pagination.value = result.pagination; phase.value = rows.value.length ? 'success' : 'empty'; return true } catch (error) { failure.value = { code: error?.code || 'UNEXPECTED_ERROR', requestId: error?.requestId || '' }; phase.value = 'error'; return false } }
  async function exportRows(payload) { try { return (await source.exportJson(payload)).rows } catch (error) { failure.value = { code: error?.code || 'UNEXPECTED_ERROR', requestId: error?.requestId || '' }; phase.value = 'error'; return null } }
  return { phase, rows, failure, page, pageSize, pagination, query,
    changePage: (value) => { page.value = value; return query() },
    changePageSize: (value) => { pageSize.value = value; page.value = 1; return query() }, exportRows }
}
