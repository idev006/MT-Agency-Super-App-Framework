// VC-ADR-036 S2: Vehicle 360 dimensions reach the UI only when the server sent them.
import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { mapVehicle360 } from '../src/infrastructure/vehicles/gas-vehicle-detail-repository.js'
import VehicleDetailTabs from '../src/features/vehicle-search/components/VehicleDetailTabs.vue'

const vehicle = { vehicleId: 'v1', plate: 'กข1', province: '10', status: 'ACTIVE', vehicleType: 'SEDAN', plateType: 'P', brand: 'B', model: 'M', color: 'W',
  labels: { vehicleType: '', color: '', plateType: '' }, organization: { id: '', name: '' }, registeredAt: '', updatedAt: '', qr: { known: true, active: true, issuedAt: '' }, contacts: [], photos: [] }
const adminData = { createdByName: 'ผู้อนุมัติ', updatedByName: 'ผู้แก้', owner: { name: 'เจ้าของ' },
  registration: { status: 'APPROVED', submittedAt: '2026-11-24T01:00:00Z', reviewedAt: '2026-11-24T02:00:00Z', reviewedByName: 'ผู้อนุมัติ', campaignName: 'แคมเปญ ก', viaCampaign: true },
  changeRequests: [{ status: 'APPROVED', submittedAt: '2026-11-24T03:00:00Z', submittedByName: 'เจ้าของ', reviewedAt: '', reviewedByName: 'ผู้แก้', fields: ['color'] }],
  retention: null, accessLog: [{ at: '2026-11-25T01:00:00Z', actorName: 'แอดมิน', source: 'DETAIL', result: 'FOUND' }], token: 'must-not-pass' }

describe('Vehicle 360 (S2)', () => {
  it('maps only whitelisted 360 fields; a staff payload yields nothing', () => {
    expect(mapVehicle360({ vehicleId: 'v1' })).toEqual({})
    const m = mapVehicle360(adminData)
    expect(m.registration.campaignName).toBe('แคมเปญ ก')
    expect(m.changeRequests[0].fields).toEqual(['color'])
    expect(m.accessLog[0].actorName).toBe('แอดมิน')
    expect(JSON.stringify(m)).not.toContain('must-not-pass')
    const regAdmin = mapVehicle360({ ...adminData, accessLog: undefined })
    expect(regAdmin.accessLog).toBeUndefined()
  })
  it('tabs: staff sees no 360 tabs; admin sees origin; SYSTEM_ADMIN also sees the access log', async () => {
    const render = (extras) => renderToString(createSSRApp(VehicleDetailTabs, { result: { vehicle, version: 1, history: [], extras } }))
    const staff = await render({})
    expect(staff).not.toContain('ที่มาและคำขอ'); expect(staff).not.toContain('การเข้าดู')
    const reg = await render(mapVehicle360({ ...adminData, accessLog: undefined }))
    expect(reg).toContain('ที่มาและคำขอ'); expect(reg).not.toContain('>การเข้าดู<')
    expect(reg).toContain('บัญชีเจ้าของรถ'); expect(reg).toContain('แคมเปญ แคมเปญ ก')
    const sys = await render(mapVehicle360(adminData))
    expect(sys).toContain('การเข้าดู'); expect(sys).toContain('แอดมิน')
  })
})
