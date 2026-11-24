// R3: plate search by Thai province name, coordinator-first vehicle card, folded manual QR entry.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PROVINCES, provinceLabel } from '../src/domain/reference/provinces.js'
import { formatThaiPhone, orderContacts, photoSlotLabel, telHref } from '../src/domain/reference/vehicle-presentation.js'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('provinces mirror the backend reference seed (business key codes)', () => {
  it('has the same 77 code/label pairs as ReferenceSeedV1', () => {
    const seed = read('../../backend/gas/src/domain/reference/ReferenceSeedV1.js')
    const block = seed.match(/const PROVINCES=Object\.freeze\(\[([\s\S]*?)\]\);/)[1]
    const backend = [...block.matchAll(/\['(\d+)','([^']+)'\]/g)].map(([, code, label]) => ({ code, label }))
    expect(backend).toHaveLength(77)
    expect(PROVINCES.map(({ code, label }) => ({ code, label }))).toEqual(backend)
  })
  it('labels codes and passes the backend province-code rule', () => {
    expect(provinceLabel('10')).toBe('กรุงเทพมหานคร')
    expect(provinceLabel('XX')).toBe('')
    for (const { code } of PROVINCES) expect(code).toMatch(/^[A-Za-z0-9_-]{1,32}$/)
  })
})

describe('vehicle presentation', () => {
  it('formats E.164 Thai numbers and builds tel links only for valid numbers', () => {
    expect(formatThaiPhone('+66812345678')).toBe('081-234-5678')
    expect(formatThaiPhone('+6621234567')).toBe('02-123-4567')
    expect(formatThaiPhone('')).toBe('')
    expect(telHref('+66812345678')).toBe('tel:+66812345678')
    expect(telHref('081 234')).toBe('')
    expect(telHref('javascript:alert(1)')).toBe('')
  })
  it('puts the primary contact first and keeps the rest in order', () => {
    const list = [{ name: 'a' }, { name: 'b', isPrimary: true }, { name: 'c' }]
    expect(orderContacts(list).map((c) => c.name)).toEqual(['b', 'a', 'c'])
    expect(list.map((c) => c.name)).toEqual(['a', 'b', 'c'])
  })
  it('labels the five photo slots in Thai', () => {
    expect(['FRONT', 'REAR', 'LEFT', 'RIGHT', 'FRONT_ANGLE'].map(photoSlotLabel)).not.toContain('ไม่ระบุตำแหน่ง')
  })
})

describe('R3 page contracts', () => {
  it('search uses the province picker instead of a free-text code', () => {
    const form = read('../src/features/vehicle-search/components/VehicleSearchForm.vue')
    expect(form).toContain('SearchableReferenceCombobox')
    expect(form).not.toContain('TH-10')
  })
  it('vehicle card shows coordinators before photos and history, with a call button', () => {
    const card = read('../src/features/vehicle-search/components/VehicleSearchResult.vue')
    expect(card.indexOf('contact-title')).toBeLessThan(card.indexOf('photo-title'))
    expect(card).toContain(':href="telHref(contact.phone)"')
  })
  it('QR page keeps manual entry folded and never puts the token in the URL', () => {
    const page = read('../src/pages/QrResolvePage.vue')
    expect(page.indexOf('<details')).toBeLessThan(page.indexOf('<form'))
    expect(page).toContain('type="password"')
    expect(page).not.toMatch(/query:\s*\{[^}]*token/)
  })
})
