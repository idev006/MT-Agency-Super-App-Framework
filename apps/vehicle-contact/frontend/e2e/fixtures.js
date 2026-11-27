// Shared E2E fixtures: a hermetic page (mock API, every other host blocked), sign-in via the real form,
// and the owner's table rules + basic accessibility as reusable checks.
import { test as base, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createMockApi } from './mock-api.js'
import { CORE_URL } from '../playwright.config.js'

const AXE = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')

export const test = base.extend({
  // auto: EVERY test gets the mock + the network block, even when it does not use `api` (a test that
  // forgot it once reached the live backend — never again).
  api: [async ({ page }, use) => {
    const api = createMockApi()
    await page.route('**/*', (route) => {
      const url = route.request().url()
      if (url.startsWith(CORE_URL)) return api.handle(route)
      if (url.startsWith('http://localhost:') || url.startsWith('data:')) return route.continue()
      return route.abort() // hermetic: nothing leaves the machine
    })
    await use(api)
  }, { auto: true }],
})
export { expect }

export async function signIn(page, to = '/#/app/dashboard') {
  await page.goto(to)
  await page.getByLabel('ชื่อผู้ใช้', { exact: true }).fill('e2e_admin')
  await page.locator('input[autocomplete="current-password"]').fill('e2e-synthetic-password')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click()
}

// Owner rules (2026-11-25): every data-table column ≤ 350px; short data never wraps onto a second line;
// tables scroll sideways inside their box — the page itself never scrolls sideways.
export async function expectTableRules(page) {
  const report = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('table.p6-table th, table.p6-table td')].filter((c) => c.offsetParent !== null)
    const wide = cells.filter((c) => c.getBoundingClientRect().width > 350.5).map((c) => c.innerText.slice(0, 40))
    // Count the rendered text lines of the cell's own content (a cell is as tall as its row, so its
    // height says nothing): distinct line tops of the text's client rects.
    const lines = (c) => {
      const tops = [], walker = document.createTreeWalker(c, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim()) continue
        const r = document.createRange(); r.selectNodeContents(n)
        for (const x of r.getClientRects()) if (x.width > 0) tops.push(x.top)
      }
      tops.sort((x, y) => x - y)
      return tops.filter((t, i) => i === 0 || t - tops[i - 1] > 6).length // a new line starts ≥6px lower
    }
    const wrapped = cells.filter((c) => {
      const text = c.innerText.trim()
      if (!text || text.length > 24 || c.querySelector('img,button,a,input,select,.p6-col-sub,.badge')) return false
      return lines(c) > 1
    }).map((c) => c.innerText.trim())
    return { cells: cells.length, wide, wrapped, pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1 }
  })
  expect(report.wide, 'columns wider than 350px').toEqual([])
  expect(report.wrapped, 'short values wrapped onto a second line').toEqual([])
  expect(report.pageOverflow, 'the page scrolls sideways').toBe(false)
  return report
}

export async function expectNoSeriousA11y(page) {
  await page.addScriptTag({ content: AXE })
  const violations = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.length} ${v.nodes.map((n) => n.target.join(' ') + ' ' + (n.any[0]?.message || '')).join(' | ').slice(0, 300)}`))
  expect(violations, 'serious/critical accessibility violations').toEqual([])
}
