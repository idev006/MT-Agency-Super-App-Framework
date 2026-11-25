// Owner 2026-11-25: "ทำตารางข้อมูลที่ frontend ให้สวยงาม columns มีความกว้างที่เหมาะสม ให้กว้างสูงสุดไม่เกิน 350px
// ผู้ใช้ชอบแบบตารางและยอม overflow-x: scroll".
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import DataTable from '../src/components/common/DataTable.vue'

const SRC = new URL('../src/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
const vueFiles = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? vueFiles(p) : p.endsWith('.vue') ? [p] : [] })

describe('one table style', () => {
  it('cells never exceed 350px, the table sizes to content and the wrapper scrolls sideways', () => {
    const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.p6-table th, \.p6-table td \{ max-width: 350px;/)
    expect(css).toMatch(/\.p6-table \{ width: max-content; max-width: none;/)
    expect(css).toMatch(/\.p6-table-wrap \{ width: fit-content; max-width: 100%; overflow-x: auto;/)
  })
  it('every table in the app uses the shared style (no ad-hoc daisyUI tables left)', () => {
    for (const file of vueFiles(SRC)) {
      const src = readFileSync(file, 'utf8')
      if (!src.includes('<table')) continue
      expect(src, file).toContain('class="p6-table"')
      expect(src, file).not.toMatch(/<table class="table/)
    }
  })
  it('DataTable maps column kinds to classes and keeps the first column sticky', async () => {
    const html = await renderToString(createSSRApp(DataTable, { label: 'x', rowKey: 'id', rows: [{ id: 1, a: 'A', d: 'D' }],
      columns: [{ key: 'a', label: 'A', kind: 'name' }, { key: 'd', label: 'D', kind: 'date' }] }))
    expect(html).toContain('p6-table-wrap')
    expect(html).toMatch(/class="p6-col-sticky p6-col-name/)
    expect(html).toContain('p6-col-date')
    expect(html).toContain('<div class="p6-cell">')
  })
})
