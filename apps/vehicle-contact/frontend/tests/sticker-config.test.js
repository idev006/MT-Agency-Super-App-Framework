// VC-ADR-038 (owner 2026-11-26): person types + sticker colours are configurable and follow the workflow
// (register → approve → maintain → print); whole sticker in the colour; font Krub.
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { DEFAULT_STICKER_CATEGORIES, stickerInk, toSticker, toStickerList, stickerText } from '../src/domain/reference/sticker-categories.js'
import { createGasSystemSettingsRepository } from '../src/infrastructure/settings/gas-system-settings-repository.js'
import { createGasRegistrationReviewRepository } from '../src/infrastructure/registrations/gas-registration-review-repository.js'
import { createGasRegistrationIntakeRepository } from '../src/infrastructure/registrations/gas-registration-intake-repository.js'
import QrStickerSheet from '../src/features/qr-governance/components/QrStickerSheet.vue'
import StickerCategorySettings from '../src/features/settings/components/StickerCategorySettings.vue'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const ORANGE = { code: 'RETIRED_OFFICER', label: 'ข้าราชการบำนาญ', colour: 'ส้ม', hex: '#ff7a00', size: 8, active: true }

describe('configurable person types / sticker colours', () => {
  it('defaults and the text-colour rule mirror the backend exactly', async () => {
    const be = await import('../../backend/gas/src/domain/policies/StickerCategoryPolicy.js')
    expect(JSON.parse(JSON.stringify(DEFAULT_STICKER_CATEGORIES))).toEqual(JSON.parse(JSON.stringify(be.DEFAULT_STICKER_CATEGORIES)))
    for (const hex of ['#d71920', '#1f3f99', '#138a3d', '#f2c200', '#6b2fa3', '#e75aa0', '#ff7a00', '#000000', '#ffffff', '#777777']) {
      expect(stickerInk(hex)).toBe(be.stickerInk(hex))
    }
    expect(stickerInk('#f2c200')).toBe('#111111') // yellow → dark text
    expect(stickerInk('#1f3f99')).toBe('#ffffff') // blue → white text
  })

  it('a sticker from the API is validated; malformed entries are dropped', () => {
    expect(toSticker(ORANGE)).toEqual({ ...ORANGE, ink: '#111111' })
    expect(toSticker({ ...ORANGE, hex: 'orange' })).toBeNull()
    expect(toSticker({ ...ORANGE, size: 6 })).toBeNull()
    expect(toStickerList([ORANGE, null, { code: 'x' }])).toHaveLength(1)
    expect(stickerText(toSticker(ORANGE))).toBe('ส้ม · ข้าราชการบำนาญ · 8×8 ซม.')
    expect(stickerText(null)).toBe('ยังไม่กำหนด')
  })

  it('settings: the list is read with system.config.get and saved whole (no derived fields sent)', async () => {
    const callOperation = vi.fn().mockResolvedValue({ data: { idle_timeout_minutes: '30', retention_days: null, sticker_categories: [{ ...ORANGE, ink: '#111111' }] } })
    const repo = createGasSystemSettingsRepository({ callOperation })
    expect((await repo.get()).settings.stickerCategories[0].label).toBe('ข้าราชการบำนาญ')
    await repo.updateStickerCategories({ categories: [{ ...ORANGE, ink: '#111111' }] })
    expect(callOperation).toHaveBeenLastCalledWith('system.config.update', { values: { sticker_categories: [ORANGE] } }, { signal: undefined })
    callOperation.mockResolvedValueOnce({ data: { idle_timeout_minutes: '30', retention_days: null } }) // older backend
    expect((await repo.get()).settings.stickerCategories).toHaveLength(6)
  })

  it('register: the public form gets the ACTIVE types; approve: the reviewer sends the chosen type (APPROVE only)', async () => {
    const pub = vi.fn().mockResolvedValue({ data: { valid: true, campaignId: 'c1', stickerCategories: [{ code: 'NCO', label: 'ส.ต.ต. – ด.ต.' }, { bad: 1 }] } })
    expect((await createGasRegistrationIntakeRepository({ callPublicOperation: pub }).validateCampaign('t'.repeat(64))).stickerCategories)
      .toEqual([{ code: 'NCO', label: 'ส.ต.ต. – ด.ต.' }])
    const callOperation = vi.fn().mockResolvedValue({ data: { requestId: 'r1', status: 'APPROVED', vehicleId: 'v1' } })
    const repo = createGasRegistrationReviewRepository({ callOperation })
    await repo.review({ requestId: 'r1', decision: 'APPROVE', platePhotoVerified: true, stickerCategory: 'NCO' })
    expect(callOperation).toHaveBeenLastCalledWith('registrations.review', { requestId: 'r1', decision: 'APPROVE', platePhotoVerified: true, stickerCategory: 'NCO' })
    callOperation.mockResolvedValueOnce({ data: { requestId: 'r1', status: 'REJECTED' } })
    await repo.review({ requestId: 'r1', decision: 'REJECT', stickerCategory: 'NCO' })
    expect(callOperation).toHaveBeenLastCalledWith('registrations.review', { requestId: 'r1', decision: 'REJECT' })
    const page = read('../src/pages/RegistrationReviewPage.vue')
    expect(page).toContain(':disabled="!canApprove"')
    expect(read('../src/pages/RegistrationIntakePage.vue')).toContain('v-model="fields.stickerCategory"')
  })

  it('print: the sticker uses the configured colour, text colour and size from the server', async () => {
    const html = await renderToString(createSSRApp(QrStickerSheet, { items: [{ vehicleId: 'o', plate: 'ก1', province: '30', qrId: 'q1', token: 'ab'.repeat(32), stickerCategory: 'RETIRED_OFFICER', sticker: toSticker(ORANGE) }] }))
    expect(html).toMatch(/data-sticker="o" data-size="8" data-category="RETIRED_OFFICER"/)
    expect(html).toContain('--band:#ff7a00;--ink:#111111')
    expect(html).toContain('ข้าราชการบำนาญ')
  })

  it('settings page: the table shows each type with a colour swatch; read-only users get no edit buttons', async () => {
    const categories = DEFAULT_STICKER_CATEGORIES.map(toSticker)
    const ro = await renderToString(createSSRApp(StickerCategorySettings, { categories, canManage: false }))
    expect(ro).toContain('data-swatch="NCO"')
    expect(ro).not.toContain('เพิ่มประเภท')
    const rw = await renderToString(createSSRApp(StickerCategorySettings, { categories, canManage: true }))
    expect(rw).toContain('เพิ่มประเภท')
    expect(read('../src/pages/SystemSettingsPage.vue')).toContain('<StickerCategorySettings')
  })

  it('font: Krub (owner 2026-11-26)', () => {
    expect(read('../index.html')).toContain('family=Krub:ital,wght@0,200;0,300;0,400;0,500;0,600;0,700;1,200')
    const css = read('../src/styles.css')
    expect(css).toContain('font-family: "Krub"')
    expect(css).toContain('.krub-bold-italic')
    expect(css).not.toContain('Pridi')
  })
})

describe('print pages are laid out from the capacity (live PDF review 2026-11-26)', () => {
  it('16 stickers of 5 cm on A4 office = 2 pages (15 + 1); each page is its own block', async () => {
    const items = Array.from({ length: 16 }, (_, i) => ({ vehicleId: 'v' + i, plate: 'ก' + i, province: '30', qrId: 'q' + i, token: 'ab'.repeat(32), stickerCategory: 'NCO', sticker: toSticker(DEFAULT_STICKER_CATEGORIES[3]) }))
    const html = await renderToString(createSSRApp(QrStickerSheet, { items, mode: 'office', paper: 'A4' }))
    expect((html.match(/data-page="/g) || []).length).toBe(2)
    expect(html).toContain('data-page="2"')
    const a3 = await renderToString(createSSRApp(QrStickerSheet, { items, mode: 'sheet', paper: 'A3' }))
    expect((a3.match(/data-page="/g) || []).length).toBe(1) // 24 per A3 sheet
  })
})
