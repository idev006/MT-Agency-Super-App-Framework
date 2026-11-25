// Owner 2026-11-25: no backend product wording in the UI; system info on ONE About page.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = new URL('../src/', import.meta.url)
function vueFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? vueFiles(full) : name.endsWith('.vue') ? [full] : []
  })
}
const templateOf = (text) => (text.match(/<template>[\s\S]*<\/template>/) || [''])[0]

describe('UI wording and About page', () => {
  it('no page template mentions GAS, Apps Script, Cloudflare or the Worker', () => {
    for (const file of vueFiles(SRC.pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
      const tpl = templateOf(readFileSync(file, 'utf8'))
      expect(tpl, file).not.toMatch(/\bGAS\b|Apps Script|Cloudflare|\bWorker\b/)
    }
  })
  it('no page carries a technical footer any more', () => {
    for (const file of vueFiles(SRC.pathname.replace(/^\/([A-Za-z]:)/, '$1'))) expect(readFileSync(file, 'utf8'), file).not.toContain('<template #footer>')
  })
  it('About is a shared menu item and a route; the old connection URL redirects to it', () => {
    const menu = readFileSync(new URL('domain/navigation/menu-catalog.js', SRC), 'utf8')
    expect(menu).toMatch(/id: 'about'.*route: 'about', shared: true/)
    const router = readFileSync(new URL('router/index.js', SRC), 'utf8')
    expect(router).toContain("path: 'about', name: 'about'")
    expect(router).toContain("path: 'connection', redirect: { name: 'about' }")
  })
  it('the About page shows status, versions, session and safeguards as tables', () => {
    const about = readFileSync(new URL('pages/AboutPage.vue', SRC), 'utf8')
    for (const text of ['สถานะและเวอร์ชัน', 'เซสชันของคุณ', 'การคุ้มครองข้อมูลและความปลอดภัย', 'ตรวจสถานะอีกครั้ง', '<table']) expect(about).toContain(text)
  })
})
