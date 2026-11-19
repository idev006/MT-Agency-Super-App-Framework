import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { compileScript, parse } from '@vue/compiler-sfc'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const pagination = read('../src/components/common/PaginationControl.vue')
const icon = read('../src/components/common/AppIcon.vue')
const dateTime = read('../src/components/common/ResponsiveDateTimeField.vue')

describe('shared responsive input primitives', () => {
  it.each([
    ['PaginationControl.vue', pagination],
    ['AppIcon.vue', icon],
    ['ResponsiveDateTimeField.vue', dateTime],
  ])('parses %s as a valid Vue SFC', (filename, source) => {
    const descriptor = parse(source, { filename })
    expect(descriptor.errors).toEqual([])
    expect(() => compileScript(descriptor.descriptor, { id: filename })).not.toThrow()
  })

  it('supports the complete pagination size contract and accessible controls', () => {
    expect(pagination).toContain('Object.freeze([1, 5, 10, 15, 25, 50, 100])')
    expect(pagination).toContain('aria-label="จำนวนรายการต่อหน้า"')
    expect(pagination).toContain('aria-label="ก่อนหน้า"')
    expect(pagination).toContain('aria-label="ถัดไป"')
    expect(pagination).toContain('aria-label="เลือกหน้าปัจจุบัน"')
    expect(pagination).toContain('Array.from({ length: totalPages.value }')
    expect(pagination).toContain('v-for="option in pageOptions"')
    expect(pagination).toContain('<AppIcon name="previous"')
    expect(pagination).toContain('<AppIcon name="next"')
    expect(pagination).toContain('min-h-11')
    expect(pagination).toContain('flex-col')
    expect(pagination).toContain('sm:flex-row')
  })

  it('uses dependency-free inline SVG with decorative and labelled modes', () => {
    expect(icon).toContain('<svg')
    expect(icon).toContain('<path v-for=')
    expect(icon).toContain(':aria-hidden=')
    expect(icon).toContain(':aria-label=')
    expect(icon).not.toMatch(/from ['"](lucide|heroicons|fontawesome)/)
  })

  it('uses native responsive date/time inputs with persistent labels and error association', () => {
    expect(dateTime).toContain("['date', 'time', 'datetime-local']")
    expect(dateTime).toContain(':type="type"')
    expect(dateTime).toContain('min-w-0 max-w-full')
    expect(dateTime).toContain('overflow-hidden')
    expect(dateTime).toContain(':aria-describedby="describedBy"')
    expect(dateTime).toContain(':aria-invalid=')
    expect(dateTime).not.toContain('position:')
  })
})
