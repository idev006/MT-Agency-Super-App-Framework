// R2: "งานรอดำเนินการ" on the role home. Each source is shown only when the session holds the
// permission the backend enforces for it, and asks for one row (pageSize 1) because only `total`
// is needed. A failing source never hides the others: it is reported as its own error state.
export const PENDING_WORK_SOURCES = Object.freeze([
  Object.freeze({
    id: 'registrations', permission: 'vehicle.registration.approve', route: 'registration-review',
    label: 'คำขอลงทะเบียนรอตรวจสอบ', emptyText: 'ไม่มีคำขอลงทะเบียนค้างตรวจ',
    repository: 'registrationReview',
  }),
  Object.freeze({
    id: 'changes', permission: 'vehicle.change.approve', route: 'change-review',
    label: 'คำขอเปลี่ยนแปลงรอตรวจสอบ', emptyText: 'ไม่มีคำขอเปลี่ยนแปลงค้างตรวจ',
    repository: 'changeReview',
  }),
])

export function pendingSourcesFor(permissions = []) {
  const granted = new Set(permissions)
  return PENDING_WORK_SOURCES.filter((source) => granted.has(source.permission))
}

export async function loadPendingCount(source, repositories) {
  const repository = repositories[source.repository]
  if (!repository?.listPending) return { id: source.id, status: 'error', total: null, errorCode: 'NOT_CONFIGURED' }
  try {
    const result = await repository.listPending({ page: 1, pageSize: 1 })
    const total = result?.pagination?.total
    if (!Number.isSafeInteger(total) || total < 0) return { id: source.id, status: 'error', total: null, errorCode: 'INVALID_RESPONSE' }
    return { id: source.id, status: 'ready', total, errorCode: '' }
  } catch (caught) {
    return { id: source.id, status: 'error', total: null, errorCode: typeof caught?.code === 'string' ? caught.code : 'UNEXPECTED_ERROR' }
  }
}
