import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../src/pages/VehicleSearchPage.vue', import.meta.url), 'utf8')
const form = readFileSync(new URL('../src/features/vehicle-search/components/VehicleSearchForm.vue', import.meta.url), 'utf8')
const result = readFileSync(new URL('../src/features/vehicle-search/components/VehicleSearchResult.vue', import.meta.url), 'utf8')
const router = readFileSync(new URL('../src/router/index.js', import.meta.url), 'utf8')

describe('STAFF vehicle search page contract', () => {
  it('uses the shared page/context contracts and declares route permission metadata', () => {
    expect(page).toContain('<PageTemplateComponent')
    expect(page).toContain('<OperationalContextStrip')
    expect(page).toContain('<template #toolbar>')
    expect(router).toMatch(/name: 'vehicle-search'.*requiredPermissions: \['vehicle\.lookup'\]/)
  })

  it('uses native DaisyUI components without a low-level API import', () => {
    for (const token of ['fieldset', 'input', 'btn', 'card', 'alert', 'skeleton', 'collapse']) {
      expect(`${page}\n${form}\n${result}`).toContain(token)
    }
    expect(page).not.toContain('gas-api-client')
    expect(form).not.toContain('fetch(')
    expect(result).not.toContain('storageRef')
  })

  it('renders all required asynchronous states with Thai recovery copy', () => {
    for (const phase of ['loading', 'empty', 'forbidden', 'recoverable-error', 'error', 'success']) {
      expect(page).toContain(`'${phase}'`)
    }
    expect(page).toContain('ลองอีกครั้ง')
    expect(page).toContain('ไม่มีข้อมูลถูกเปลี่ยนแปลง')
  })
})
