// S5 (owner 2026-11-25): "admin ควรเห็น QR ของ รถแต่ละคันได้อย่างสะดวก" + "หน้าที่ผู้ใช้สามารถสั่ง export qr ของรถที่เลือกได้
// เพื่อนำไปให้โรงพิมพ์ จัดพิมพ์". VC-ADR-032: QR = link <app>#/q/<code>; plate printed beside the QR.
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { codeFromScan, stickerShortCode, vehicleQrLink } from '../src/domain/qr/vehicle-qr-link.js'
import { safeRedirect } from '../src/application/auth/safe-redirect.js'
import { createGasQrGovernanceRepository } from '../src/infrastructure/qr/gas-qr-governance-repository.js'
import QrStickerSheet from '../src/features/qr-governance/components/QrStickerSheet.vue'
import { useQrScanner } from '../src/features/qr-scanner/useQrScanner.js'

const CODE = 'ab'.repeat(32)
const here = { origin: 'https://idev006.github.io', pathname: '/MT-Agency-Super-App-Framework/apps/vehicle-contact/frontend/' }
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('S5 QR link, export and print', () => {
  it('the QR is a link to THIS app with the code in the hash; only that link or the bare code is accepted', () => {
    const link = vehicleQrLink(CODE, here)
    expect(link).toBe(`${here.origin}${here.pathname}#/q/${CODE}`)
    expect(codeFromScan(link, here)).toBe(CODE)
    expect(codeFromScan(CODE.toUpperCase(), here)).toBe(CODE)
    expect(codeFromScan(`https://evil.example/#/q/${CODE}`, here)).toBe('')
    expect(codeFromScan(`${here.origin}${here.pathname}#/q/${CODE}x`, here)).toBe('')
    expect(codeFromScan('https://x/#/register?c=' + CODE, here)).toBe('')
    expect(stickerShortCode('a1b2c3d4e5f6')).toBe('A1B2C3D4')
  })

  it('sign-in returns only to an in-app page (a scanned sticker survives the sign-in)', () => {
    expect(safeRedirect(`/app/vehicles/qr?t=${CODE}`)).toBe(`/app/vehicles/qr?t=${CODE}`)
    for (const bad of ['https://evil.example', '//evil.example', '/signin', 'javascript:alert(1)', '/app/../x', undefined]) expect(safeRedirect(bad)).toBe('')
    expect(read('../src/router/index.js')).toContain("{ path: '/q/:code', name: 'qr-link'")
  })

  it('the repository maps qr.export and keeps a code only for READY items', async () => {
    const callOperation = vi.fn().mockResolvedValue({ data: { items: [
      { vehicleId: 'v1', status: 'READY', plate: 'กข1', province: '65', qrId: 'q1', token: CODE },
      { vehicleId: 'v2', status: 'REISSUE_NEEDED', plate: 'กข2', token: CODE },
    ] } })
    const items = await createGasQrGovernanceRepository({ callOperation }).exportCodes(['v1', 'v2'])
    expect(callOperation).toHaveBeenCalledWith('qr.export', { vehicleIds: ['v1', 'v2'] })
    expect(items[0].token).toBe(CODE)
    expect(items[1].token).toBe('')
  })

  it('a sticker shows the QR, the plate BESIDE it, province, unit mark and short code', async () => {
    const html = await renderToString(createSSRApp(QrStickerSheet, { items: [{ vehicleId: 'v1', plate: 'กข1234', province: '65', qrId: 'a1b2c3d4ffff', token: CODE }] }))
    expect(html).toContain('data:image/gif;base64,')
    expect(html).toContain('กข1234')
    expect(html).toContain('ตำรวจภูธรภาค 6')
    expect(html).toContain('A1B2C3D4')
    expect(html).toContain('qr-sheet--a4')
  })

  it('the in-app scanner accepts the sticker link of this app', async () => {
    globalThis.location = { ...here, href: here.origin + here.pathname }
    const scanner = { start: vi.fn(), stop: vi.fn().mockResolvedValue(), scanFile: vi.fn() }
    let decode
    scanner.start.mockImplementation(async ({ onDecode }) => { decode = onDecode; return { devices: [] } })
    const onDecoded = vi.fn()
    const work = useQrScanner({ scanner, elementId: 'r', onDecoded })
    await work.start()
    await decode(vehicleQrLink(CODE, here))
    expect(onDecoded).toHaveBeenCalledWith(CODE)
    delete globalThis.location
  })

  it('the print page: pick vehicles (max 100), export, A4 or one per page, print; QR card in the vehicle detail', () => {
    const page = read('../src/pages/QrPrintPage.vue')
    expect(page).toContain('qrRepository.exportCodes(')
    expect(page).toContain('const MAX = 100')
    expect(page).toContain('<QrStickerSheet')
    expect(page).toContain('globalThis.print')
    expect(read('../src/router/index.js')).toMatch(/name: 'qr-print'.*requiredPermissions: \['qr\.manage', 'vehicle\.list'\]/)
    const tabs = read('../src/features/vehicle-search/components/VehicleDetailTabs.vue')
    expect(tabs).toContain('QR ปัจจุบัน')
    expect(tabs).toContain("name: 'qr-print', query: { vehicle: vehicle.vehicleId }")
  })
})
