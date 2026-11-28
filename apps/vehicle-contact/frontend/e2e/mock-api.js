// In-memory mock of the P6VC v1 API envelope for E2E. Shapes follow the frontend repositories' contracts;
// permissions come from the backend's own ROLE_PERMISSIONS so roles never drift. Data is synthetic and
// deliberately includes long Thai names and 64-char ids to exercise the table rules.
import { ROLE_PERMISSIONS } from '../../backend/gas/src/application/security/SessionService.js'
import { DEFAULT_STICKER_CATEGORIES, resolveSticker, stickerInk } from '../../backend/gas/src/domain/policies/StickerCategoryPolicy.js'
import { defaultLogPolicy, logPolicyList, parseLogPolicy } from '../../backend/gas/src/domain/policies/LogPolicy.js'
import { DEFAULT_PHOTO_POLICY, parsePhotoPolicy } from '../../backend/gas/src/domain/policies/PhotoPolicy.js'

const CODE = (n) => n.toString(16).padStart(2, '0').repeat(32)
const at = (m) => new Date(Date.UTC(2026, 10, 25, 4, 0) + m * 60000).toISOString()
const page = (items, p) => {
  const pageSize = p.pageSize || 10, current = p.page || 1
  return { items: items.slice((current - 1) * pageSize, current * pageSize), total: items.length, page: current, pageSize, totalPages: Math.ceil(items.length / pageSize) }
}

export function createMockApi({ roles = ['SYSTEM_ADMIN', 'REGISTRATION_ADMIN'] } = {}) {
  const permissions = [...new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r] || []))]
  const orgs = [
    { organization_id: 'o1', name: 'สถานีตำรวจภูธรเมืองนครราชสีมา จังหวัดนครราชสีมา', org_type: 'POLICE', parent_id: '', status: 'ACTIVE' },
    { organization_id: 'o2', name: 'สภ.ปากช่อง', org_type: 'POLICE', parent_id: 'o1', status: 'ACTIVE' },
    { organization_id: 'o3', name: 'บริษัทรักษาความปลอดภัยตัวอย่างจำกัด (มหาชน) สาขาภาคตะวันออกเฉียงเหนือ', org_type: 'EXTERNAL', parent_id: '', status: 'ACTIVE' },
    { organization_id: 'o4', name: 'หน่วยงานเดิม', org_type: 'POLICE', parent_id: '', status: 'DISABLED' },
  ]
  const orgName = (id) => orgs.find((o) => o.organization_id === id)?.name || ''
  const users = [
    { userId: 'u-admin', username: 'e2e_admin', displayName: 'ผู้ดูแลระบบทดสอบ', organizationId: '', status: 'ACTIVE', roles: ['SYSTEM_ADMIN', 'REGISTRATION_ADMIN'] },
    ...Array.from({ length: 14 }, (_, i) => ({ userId: `u${i}`, username: `staff_${String(i).padStart(2, '0')}`, displayName: i === 3 ? 'ร้อยตำรวจเอกสมชายผู้มีชื่อยาวมากเป็นพิเศษ เพื่อทดสอบการตัดบรรทัด' : `เจ้าหน้าที่ ${i}`,
      organizationId: i % 3 ? 'o2' : 'o1', status: i % 5 === 4 ? 'SUSPENDED' : 'ACTIVE', roles: i % 4 === 0 ? ['REGISTRATION_ADMIN'] : ['STAFF'] })),
  ]
  const campaigns = [
    { campaignId: 'c1', name: 'ลงทะเบียนรถ สภ.ปากช่อง ธันวาคม 2569', startsAt: at(-600), endsAt: at(60 * 24 * 20), maxSubmissions: 200, submittedCount: 37, status: 'ACTIVE', state: 'OPEN', campaignToken: CODE(201) },
    { campaignId: 'c2', name: 'แคมเปญล่วงหน้า', startsAt: at(60 * 24 * 3), endsAt: at(60 * 24 * 30), maxSubmissions: 50, submittedCount: 0, status: 'ACTIVE', state: 'UPCOMING', campaignToken: CODE(202) },
    { campaignId: 'c3', name: 'แคมเปญเก่า', startsAt: at(-60 * 24 * 60), endsAt: at(-60 * 24 * 30), maxSubmissions: 10, submittedCount: 10, status: 'ACTIVE', state: 'ENDED', campaignToken: CODE(203) },
  ]
  const vehicles = [
    { vehicleId: 'v1', plate: 'กข1234', province: '30', status: 'ACTIVE', vehicleType: 'RY01', brand: 'TOYOTA', model: 'Yaris Ativ', color: 'WHITE', colorLabel: 'ขาว', vehicleTypeLabel: 'รถยนต์นั่งส่วนบุคคลไม่เกิน 7 คน', createdAt: at(-120), version: 3, qr: 'READY', stickerCategory: 'GENERAL_OFFICER' },
    { vehicleId: 'v2', plate: '1กก9999', province: '10', status: 'ACTIVE', vehicleType: 'RY03', brand: 'HONDA', model: 'Wave 110i', color: 'RED', colorLabel: 'แดง', vehicleTypeLabel: 'รถจักรยานยนต์ส่วนบุคคล', createdAt: at(-90), version: 1, qr: 'REISSUE_NEEDED' },
    { vehicleId: 'v3', plate: 'ฮฮ7', province: '30', status: 'ACTIVE', vehicleType: 'RY01', brand: 'BYD', model: 'Dolphin', color: 'GREY', colorLabel: 'เทา', vehicleTypeLabel: 'รถยนต์นั่งส่วนบุคคลไม่เกิน 7 คน', createdAt: at(-30), version: 1, qr: 'NO_ACTIVE_QR' },
  ]
  const qrCode = { v1: CODE(171) }
  // VC-ADR-042: unit + print state per vehicle (the print page filters)
  const printInfo = { v1: { organizationId: 'o2', qrPrintState: 'NOT_PRINTED', qrPrintedAt: '' }, v2: { organizationId: 'o1', qrPrintState: 'NOT_PRINTED', qrPrintedAt: '' },
    v3: { organizationId: 'o2', qrPrintState: 'NOT_PRINTED', qrPrintedAt: '' } }
  const revokedCode = CODE(172) // a sticker whose QR was replaced
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const calls = []
  // VC-ADR-038: the configurable person types (system.config) and each vehicle's resolved sticker
  let stickerConfig = DEFAULT_STICKER_CATEGORIES.map((c) => ({ ...c }))
  const withInk = (list) => list.map((c) => ({ ...c, ink: stickerInk(c.hex) }))
  const sticker = (v) => resolveSticker(v.stickerCategory || '', stickerConfig)
  // VC-ADR-040: the log policy uses the backend's own rules
  let logPolicy = defaultLogPolicy()
  let photoPolicy = DEFAULT_PHOTO_POLICY
  const logView = () => ({ log_policy: logPolicyList(logPolicy), log_counts: { LOOKUP: 1240, CONTACT: 310, PHOTO: 0, CHANGE: 474, LOGIN: 98 } })

  const detail = (v, withAdmin) => ({
    vehicleId: v.vehicleId, plate: v.plate, province: v.province, status: v.status, vehicleType: v.vehicleType, plateType: 'STANDARD',
    brand: v.brand, model: v.model, color: v.color, labels: { vehicleType: v.vehicleTypeLabel, color: v.colorLabel, plateType: 'ป้ายทะเบียนปกติ' },
    organization: { id: 'o2', name: orgName('o2') }, registeredAt: v.createdAt, updatedAt: at(-10), version: v.version,
    stickerCategory: v.stickerCategory || '', sticker: sticker(v), stickerCategories: withInk(stickerConfig.filter((c) => c.active)),
    qr: { active: v.qr !== 'NO_ACTIVE_QR', issuedAt: v.createdAt },
    contacts: [{ name: 'นายทดสอบ ระบบ', phone: '+66800000001', relationship: 'OWNER', isPrimary: true, verifiedAt: v.createdAt },
      { name: 'นางสาวผู้ประสานงานสำรอง ที่มีชื่อยาว', phone: '+66800000002', relationship: 'FAMILY', isPrimary: false, verifiedAt: v.createdAt }],
    photos: ['FRONT', 'REAR', 'LEFT', 'RIGHT', 'FRONT_ANGLE'].map((slot, i) => ({ photoId: `${v.vehicleId}-p${i}`, slot, mimeType: 'image/png', createdAt: v.createdAt })),
    history: [
      { audit_id: 'h1', action: 'REGISTRATION_APPROVED', redacted_summary: 'REGISTRATION_APPROVED', created_at: v.createdAt },
      { audit_id: 'h2', action: 'CONTACT_UPDATED', redacted_summary: 'CONTACT_UPDATED', created_at: at(-20) },
      { audit_id: 'h3', action: 'VEHICLE_UPDATED', redacted_summary: 'VEHICLE_UPDATED', created_at: at(-10) },
    ],
    ...(withAdmin ? {
      owner: { name: 'นายทดสอบ ระบบ' }, createdByName: 'ผู้ดูแลระบบทดสอบ', updatedByName: 'เจ้าหน้าที่ 1',
      registration: { status: 'APPROVED', submittedAt: at(-130), reviewedAt: v.createdAt, reviewedByName: 'ผู้ดูแลระบบทดสอบ', campaignName: campaigns[0].name, viaCampaign: true },
      changeRequests: [{ status: 'APPROVED', submittedAt: at(-25), submittedByName: 'นายทดสอบ ระบบ', reviewedAt: at(-20), reviewedByName: 'เจ้าหน้าที่ 1', fields: ['contactName', 'contactPhone'] }],
      retention: null,
      accessLog: Array.from({ length: 6 }, (_, i) => ({ at: at(-i * 7), actorName: i % 2 ? 'เจ้าหน้าที่ 1' : 'ผู้ดูแลระบบทดสอบ', source: ['DETAIL', 'LOOKUP', 'QR'][i % 3], result: 'FOUND' })),
    } : {}),
  })

  const handlers = {
    'auth.login': (p) => (p.username && p.password ? { sessionToken: 'e'.repeat(64), expiresAt: at(480), mustChangePassword: false } : { error: 'INVALID_CREDENTIALS' }),
    'auth.session': () => ({ userId: 'u-admin', displayName: 'ผู้ดูแลระบบทดสอบ', organizationId: '', roles, permissions, expiresAt: at(480), mustChangePassword: false }),
    'auth.logout': () => ({ loggedOut: true }),
    'users.list': (p) => {
      let rows = users.map((u) => ({ ...u, organizationName: orgName(u.organizationId) }))
      if (p.status) rows = rows.filter((u) => u.status === p.status)
      if (p.role) rows = rows.filter((u) => u.roles.includes(p.role))
      if (p.q) rows = rows.filter((u) => [u.displayName, u.username, u.organizationName].join(' ').toLowerCase().includes(p.q.toLowerCase()))
      return page(rows, p)
    },
    'organizations.list': (p) => {
      let rows = orgs.map((o) => ({ ...o, parentName: orgName(o.parent_id) }))
      if (p.status) rows = rows.filter((o) => o.status === p.status)
      if (p.type) rows = rows.filter((o) => o.org_type === p.type)
      if (p.q) rows = rows.filter((o) => o.name.includes(p.q))
      return page(rows, p)
    },
    'campaigns.list': (p) => {
      let rows = campaigns
      if (p.state === 'CURRENT') rows = rows.filter((c) => ['OPEN', 'UPCOMING'].includes(c.state))
      else if (p.state) rows = rows.filter((c) => c.state === p.state)
      return page(rows, p)
    },
    'system.config.get': () => ({ idle_timeout_minutes: '30', retention_days: '365', sticker_categories: withInk(stickerConfig), ...logView(), photo_policy: photoPolicy }),
    'system.config.update': (p) => {
      if (p.values?.sticker_categories) stickerConfig = p.values.sticker_categories.map((c) => ({ ...c, hex: c.hex.toLowerCase() }))
      if (p.values?.log_policy) { try { logPolicy = parseLogPolicy(p.values.log_policy) } catch (e) { return { error: e.message } } }
      // VC-ADR-055: the server's own photo-policy rules
      if (p.values?.photo_policy) { try { photoPolicy = parsePhotoPolicy(p.values.photo_policy) } catch (e) { return { error: e.message } } }
      return { idle_timeout_minutes: '30', retention_days: '365', sticker_categories: withInk(stickerConfig), ...logView(), photo_policy: photoPolicy }
    },
    // VC-ADR-039 system reset (mock: counts from the mock data; execute empties the vehicle list)
    'system.reset.preview': (p) => ({ phrase: 'RESET P6VC', planDigest: 'd'.repeat(64), options: { keepUsers: p.keepUsers !== false, keepCampaigns: p.keepCampaigns === true },
      deleteByTable: { vc_vehicles: vehicles.length, vc_vehicle_photos: vehicles.length * 5, ...(p.keepCampaigns ? {} : { vc_campaigns: campaigns.length }), ...(p.keepUsers === false ? { vc_users: users.length - 1 } : {}) },
      deleteTotal: vehicles.length * 6 + (p.keepCampaigns ? 0 : campaigns.length) + (p.keepUsers === false ? users.length - 1 : 0),
      keptByTable: { vc_reference_values: 645, vc_settings: 3, ...(p.keepUsers === false ? { vc_users: 1 } : { vc_users: users.length }) }, driveFiles: vehicles.length * 5 }),
    'system.reset.execute': (p) => {
      if (p.confirmation !== 'RESET P6VC') return { error: 'RESET_CONFIRMATION_INVALID' }
      if (p.password !== 'e2e-password-123') return { error: 'INVALID_CREDENTIALS' }
      const n = vehicles.length; vehicles.splice(0)
      return { deleted: n * 6, deleteByTable: { vc_vehicles: n }, drive: { status: 'DONE', trashed: n * 5, more: false } }
    },
    'vehicles.list': (p) => {
      if (p.printState && !['NOT_PRINTED', 'PRINTED'].includes(p.printState)) return { error: 'INVALID_REQUEST' }
      const rows = vehicles.map(({ qr, ...v }) => ({ stickerCategory: '', ...v, ...printInfo[v.vehicleId], organizationName: orgName(printInfo[v.vehicleId]?.organizationId), sticker: sticker(v) }))
        .filter((v) => (!p.organizationId || v.organizationId === p.organizationId) && (!p.stickerCategory || v.stickerCategory === p.stickerCategory)
          && (!p.printState || v.qrPrintState === p.printState) && (!p.plate || v.plate === String(p.plate).replace(/[\s-]/g, '')))
      const out = page(rows, p)
      return p.withFilterOptions ? { ...out, filterOptions: { organizations: orgs.filter((o) => o.status === 'ACTIVE').map((o) => ({ id: o.organization_id, name: o.name })),
        stickerCategories: withInk(stickerConfig), printStates: ['NOT_PRINTED', 'PRINTED'] } } : out
    },
    'qr.markPrinted': (p) => {
      const marked = p.vehicleIds.filter((id) => qrCode[id]), skipped = p.vehicleIds.filter((id) => !qrCode[id])
      for (const id of marked) printInfo[id] = { ...printInfo[id], qrPrintState: 'PRINTED', qrPrintedAt: at(0) }
      return { marked: marked.length, skipped, printedAt: at(0) }
    },
    'vehicles.detail': (p) => { const v = vehicles.find((x) => x.vehicleId === p.vehicleId); return v ? detail(v, true) : { error: 'NOT_FOUND' } },
    'qr.history': (p) => ({ items: [
      { qrId: 'q2', status: 'ACTIVE', issuedAt: at(-60), issuedByName: 'ผู้ดูแลระบบทดสอบ', reason: 'DAMAGED', note: 'สติกเกอร์ซีดจนอ่านไม่ได้', replacesQrId: 'q1', revokedAt: '', revokedByName: '', revokeReason: '', revokeNote: '' },
      { qrId: 'q1', status: 'REVOKED', issuedAt: at(-120), issuedByName: 'ผู้ดูแลระบบทดสอบ', reason: 'REGISTRATION_APPROVED', note: '', replacesQrId: '', revokedAt: at(-60), revokedByName: 'ผู้ดูแลระบบทดสอบ', revokeReason: 'DAMAGED', revokeNote: '' },
    ].map((x) => ({ ...x, vehicleId: p.vehicleId })) }),
    'qr.export': (p) => {
      const items = p.vehicleIds.map((id) => {
        const v = vehicles.find((x) => x.vehicleId === id)
        if (!v) return { vehicleId: id, status: 'NOT_FOUND' }
        const base = { vehicleId: v.vehicleId, plate: v.plate, province: v.province, vehicleType: v.vehicleType, brand: v.brand, model: v.model, color: v.color, stickerCategory: v.stickerCategory || '', sticker: sticker(v) }
        return v.qr === 'READY' ? { ...base, status: 'READY', qrId: 'a1b2c3d4e5f60718', issuedAt: v.createdAt, token: qrCode[v.vehicleId] } : { ...base, status: v.qr }
      })
      return { items, exportedAt: at(0), ready: items.filter((x) => x.status === 'READY').length }
    },
    'qr.resolve': (p) => {
      if (p.token === revokedCode) return { error: 'QR_REVOKED' }
      const id = Object.keys(qrCode).find((k) => qrCode[k] === p.token); const v = vehicles.find((x) => x.vehicleId === id)
      return v ? detail(v, false) : null
    },
    'vehicles.photo': (p) => ({ photoId: p.photoId, slot: 'FRONT', mimeType: 'image/png', base64Image: PNG }),
    'audit.query': (p) => page(Array.from({ length: 23 }, (_, i) => ({ type: i % 2 ? 'LOOKUP' : 'CHANGE', eventId: CODE(i + 1), actorId: CODE(90), vehicleId: CODE(91), entityId: CODE(92), action: i % 2 ? 'DETAIL' : 'REGISTRATION_APPROVED', at: at(-i) })), p),
    'registrations.listPending': (p) => page([], p),
    'changes.listPending': (p) => page([], p),
    'retention.listDue': (p) => page([], p),
  }

  async function handle(route) {
    const body = JSON.parse(route.request().postData() || '{}')
    const op = `${body.group}.${body.action}`
    calls.push({ op, payload: body.payload || {}, hasSession: Boolean(body.sessionToken) })
    const fn = handlers[op]
    const out = fn ? fn(body.payload || {}) : { error: 'E2E_UNMOCKED' }
    const ok = !(out && typeof out === 'object' && 'error' in out && Object.keys(out).length === 1) // null = ok with no data
    const envelope = ok ? { ok: true, data: out, error: null, requestId: body.requestId || 'e2e' }
      : { ok: false, data: null, error: { code: out.error, message: 'e2e' }, requestId: body.requestId || 'e2e' }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope) })
  }
  return { handle, calls, data: { users, orgs, campaigns, vehicles, qrCode, revokedCode } }
}
