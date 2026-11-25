// Owner 2026-11-25: "ที่หน้ารายละเอียดของรถ มีตารางและข้อมูลมาก จง refac/redesign UI/UX" + columns sized to content (max 350px),
// short data must not wrap.
import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import VehicleDetailTabs from '../src/features/vehicle-search/components/VehicleDetailTabs.vue'

const vehicle = { vehicleId: 'v1', plate: 'กฏ1234', province: '12', vehicleType: 'RY01', plateType: 'STANDARD', brand: 'BYD', model: 'Dolphin', color: 'GREY',
  labels: { vehicleType: 'รถยนต์นั่ง', color: 'เทา' }, organization: { id: 'o1', name: 'หน่วยงานทดสอบ P6' }, registeredAt: '2026-11-25T11:44:00Z', updatedAt: '2026-11-25T11:44:00Z',
  qr: { known: true, active: true, issuedAt: '2026-11-25T11:44:00Z' }, contacts: [{ name: 'ผู้ติดต่อ', phone: '+66991536288', relationship: 'OWNER', isPrimary: true }], photos: [] }
const history = [{ id: 'h1', action: 'REGISTRATION_APPROVED', occurredAt: '2026-11-25T11:44:00Z' }]

describe('vehicle detail redesign', () => {
  it('opens on an overview: vehicle facts as labelled values, the primary contact with a call button, registration record', async () => {
    const html = await renderToString(createSSRApp(VehicleDetailTabs, { result: { vehicle, version: 1, history, extras: {} }, canReadContacts: true, canReadHistory: true }))
    expect(html).toContain('>ภาพรวม<')
    expect(html).toContain('class="vd-facts"')
    expect(html).toContain('ผู้ติดต่อหลัก')
    expect(html).toContain('href="tel:+66991536288"')
    expect(html).toContain('การลงทะเบียนและการแก้ไข')
    expect(html).toContain('class="vd-meta"')
  })
  it('no squeezed key–value tables; lists that are tables use the shared style with date / text columns', async () => {
    const html = await renderToString(createSSRApp(VehicleDetailTabs, { result: { vehicle, version: 1, history, extras: {} }, canReadHistory: true }))
    expect(html).not.toMatch(/<tbody><tr><th/)
    expect(html).toContain('aria-label="ประวัติการเปลี่ยนแปลง"')
    expect(html).toContain('p6-col-date')
    expect(html).not.toContain('timeline-vertical')
  })
})
