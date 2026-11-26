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
    const html = await renderToString(createSSRApp(QrStickerSheet, { items: [{ vehicleId: 'v1', plate: 'กข1234', province: '65', qrId: 'a1b2c3d4ffff', token: CODE, stickerCategory: 'NCO' }] }))
    expect(html).toContain('data:image/gif;base64,')
    expect(html).toContain('กข1234')
    expect(html).toContain('ตำรวจภูธรภาค 6')
    expect(html).toContain('A1B2C3D4')
    expect(html).toContain('qr-sheet--office')
  })

  it('owner 2026-11-26: colour + size by category (red 8 × 8, others 5 × 5), size can be forced, no category = not printed', async () => {
    const items = [
      { vehicleId: 'r', plate: 'ก1', province: '30', qrId: 'q1', token: CODE, stickerCategory: 'GENERAL_OFFICER' },
      { vehicleId: 'y', plate: 'ก2', province: '30', qrId: 'q2', token: CODE, stickerCategory: 'NCO' },
      { vehicleId: 'n', plate: 'ก3', province: '30', qrId: 'q3', token: CODE, stickerCategory: '' },
    ]
    const byCat = await renderToString(createSSRApp(QrStickerSheet, { items }))
    expect(byCat).toMatch(/data-sticker="r" data-size="8" data-category="GENERAL_OFFICER"/)
    expect(byCat).toMatch(/data-sticker="y" data-size="5" data-category="NCO"/)
    expect(byCat).toContain('--band:#d71920')
    expect(byCat).toContain('--band:#f2c200;--ink:#111111') // yellow band → dark text
    expect(byCat).not.toContain('data-sticker="n"')
    expect(byCat).toContain('พล.ต.ต. ขึ้นไป')
    const all5 = await renderToString(createSSRApp(QrStickerSheet, { items, sizeMode: '5', mode: 'single' }))
    expect(all5).toMatch(/data-sticker="r" data-size="5"/)
    expect(all5).toContain('qr-sheet--single')
    const css = readFileSync(new URL('../src/features/qr-governance/components/QrStickerSheet.vue', import.meta.url), 'utf8')
    expect(css).toContain('.qr-sticker--5 { width: 50mm; height: 50mm;')
    expect(css).toContain('.qr-sticker--8 { width: 80mm; height: 80mm;')
    expect(css).toContain('@page qr5 { size: 56mm 56mm;') // 3 mm bleed each side
  })

  it('owner 2026-11-26: the WHOLE sticker is the colour (seen from far), white tile only behind the QR; print-shop sheet has bleed + crop marks', async () => {
    const items = [{ vehicleId: 'b', plate: 'ก9', province: '30', qrId: 'q9', token: CODE, stickerCategory: 'SENIOR_OFFICER' }]
    const sheet = await renderToString(createSSRApp(QrStickerSheet, { items, mode: 'sheet', paper: 'A3' }))
    expect(sheet).toContain('qr-sheet--paper-A3')
    expect((sheet.match(/<line /g) || []).length).toBe(8) // 8 crop marks per sticker
    expect(sheet).toContain('viewBox="0 0 64 64"') // 50 trim + 2 × (3 bleed + 4 mark zone)
    expect(await renderToString(createSSRApp(QrStickerSheet, { items, mode: 'office' }))).not.toContain('<line ')
    const css = read('../src/features/qr-governance/components/QrStickerSheet.vue')
    expect(css).toMatch(/\.qr-sticker \{[^}]*background: var\(--band\)/) // colour covers the sticker
    expect(css).toMatch(/\.qr-sticker__tile \{[^}]*background: #fff/) // quiet zone for the scanner
    expect(css).toContain('@page sheetA4 { size: A4; margin: 8mm; }')
    expect(css).toContain('body:has(> .qr-print-root) > *:not(.qr-print-root) { display: none !important; }')
  })

  it('sheet capacity per paper and pages needed (each size starts a new page)', async () => {
    const { sheetCapacity, pagesNeeded } = await import('../src/domain/qr/sticker-layout.js')
    expect(sheetCapacity('A4', 5, 'office')).toBe(15) // 3 × 5
    expect(sheetCapacity('A4', 8, 'office')).toBe(6) // 2 × 3
    expect(sheetCapacity('A4', 5, 'sheet')).toBe(12) // 3 × 4 at 64 mm pitch
    expect(sheetCapacity('A3', 5, 'sheet')).toBe(24) // 4 × 6
    expect(sheetCapacity('A5', 8, 'sheet')).toBe(2) // 1 × 2
    expect(sheetCapacity('A4', 8, 'single')).toBe(1)
    expect(pagesNeeded('A4', 'office', { 5: 16, 8: 1 })).toBe(3)
    expect(pagesNeeded('A4', 'single', { 5: 2, 8: 1 })).toBe(3)
  })

  it('the sticker categories mirror the backend policy exactly', async () => {
    const { STICKER_CATEGORIES: fe } = await import('../src/domain/reference/sticker-categories.js')
    const { STICKER_CATEGORIES: be } = await import('../../backend/gas/src/domain/policies/StickerCategoryPolicy.js')
    expect(JSON.parse(JSON.stringify(fe))).toEqual(JSON.parse(JSON.stringify(be)))
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
