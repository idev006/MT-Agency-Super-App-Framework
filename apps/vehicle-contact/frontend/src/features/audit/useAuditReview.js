import { ref } from 'vue'
import { assertAuditRepository } from '../../application/audit/audit-port.js'
export function useAuditReview({ repository }) { const source = assertAuditRepository(repository); const phase = ref('idle'); const rows = ref([]); const failure = ref(null)
  async function query(payload) { phase.value = 'loading'; failure.value = null; try { rows.value = (await source.query(payload)).rows; phase.value = rows.value.length ? 'success' : 'empty'; return true } catch (error) { failure.value = { code: error?.code || 'UNEXPECTED_ERROR', requestId: error?.requestId || '' }; phase.value = 'error'; return false } }
  async function exportRows(payload) { try { return (await source.exportJson(payload)).rows } catch (error) { failure.value = { code: error?.code || 'UNEXPECTED_ERROR', requestId: error?.requestId || '' }; phase.value = 'error'; return null } }
  return { phase, rows, failure, query, exportRows }
}
