import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mapRegistrationReferences, RegistrationReferenceContractError } from '../src/application/reference-data/registration-reference-port.js'
import { createGasRegistrationReferenceRepository } from '../src/infrastructure/reference-data/gas-registration-reference-repository.js'
import { useRegistrationReferenceStore } from '../src/stores/registration-reference.js'

function memoryStorage() {
  const values = new Map()
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) }
}
const item = (code, label = code, extra = {}) => ({ code, label, ...extra })
function response(mode = 'ADVISORY') {
  return {
    mode, version: 'a'.repeat(64),
    lists: {
      provinces: [item('BKK', 'กรุงเทพมหานคร')], plateTypes: [item('PRIVATE', 'รถยนต์ส่วนบุคคล')],
      vehicleTypes: [item('CAR', 'รถยนต์')], relationships: [item('OWNER', 'เจ้าของ')],
      brands: [item('TOYOTA', 'โตโยต้า')], models: [item('YARIS', 'ยาริส', { parentCode: 'TOYOTA' })], colors: [item('WHITE', 'ขาว')],
    },
    organizations: [item('org-1', 'หน่วยงานทดสอบ')],
    policies: Object.fromEntries(['provinces', 'plateTypes', 'vehicleTypes', 'relationships', 'brands', 'models', 'colors', 'organizations'].map((key) => [key, mode === 'ENFORCED' ? 'ENFORCED' : 'ADVISORY'])),
  }
}

beforeEach(() => { globalThis.sessionStorage = memoryStorage(); setActivePinia(createPinia()) })

describe('registration reference contract', () => {
  it('maps a bounded versioned catalog and preserves model parents', () => {
    const catalog = mapRegistrationReferences(response(), 'request-1')
    expect(catalog.lists.models[0]).toEqual({ code: 'YARIS', label: 'ยาริส', parentCode: 'TOYOTA' })
    expect(catalog.organizations[0].code).toBe('org-1')
    expect(catalog.requestId).toBe('request-1')
  })

  it('rejects duplicate codes, invalid versions and orphan models', () => {
    const duplicate = response(); duplicate.lists.provinces.push(item('BKK'))
    const orphan = response(); orphan.lists.models[0].parentCode = 'UNKNOWN'
    for (const value of [duplicate, { ...response(), version: 'old' }, orphan]) {
      expect(() => mapRegistrationReferences(value)).toThrow(RegistrationReferenceContractError)
    }
  })

  it('calls only the protected reference operation with an empty payload', async () => {
    const callOperation = vi.fn().mockResolvedValue({ data: response(), requestId: 'request-1' })
    const repository = createGasRegistrationReferenceRepository({ callOperation })
    await repository.load()
    expect(callOperation).toHaveBeenCalledWith('references.registration', {})
  })
})

describe('one-load-per-sign-in cache', () => {
  const context = { userId: 'user-1', transport: 'worker', endpoint: 'https://gateway.example/api/frontend' }
  it('loads once, restores across refresh and clears on logout', async () => {
    const load = vi.fn().mockResolvedValue(mapRegistrationReferences(response()))
    let store = useRegistrationReferenceStore(); store.configure({ load })
    await Promise.all([store.ensureLoaded(context), store.ensureLoaded(context)])
    expect(load).toHaveBeenCalledTimes(1)

    setActivePinia(createPinia())
    store = useRegistrationReferenceStore(); store.configure({ load })
    await store.ensureLoaded(context)
    expect(load).toHaveBeenCalledTimes(1)
    expect(store.mode).toBe('ADVISORY')
    store.clear()
    expect(globalThis.sessionStorage.getItem('p6vc-registration-reference-v1')).toBeNull()
  })

  it('does not reuse another user or endpoint cache', async () => {
    const load = vi.fn().mockResolvedValue(mapRegistrationReferences(response()))
    const store = useRegistrationReferenceStore(); store.configure({ load })
    await store.ensureLoaded(context)
    await store.ensureLoaded({ ...context, userId: 'user-2' })
    await store.ensureLoaded({ ...context, userId: 'user-2', endpoint: 'https://new.example/api/frontend' })
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('does not let a late response from an old endpoint overwrite the active catalog', async () => {
    let resolveOld
    const oldResponse = new Promise((resolve) => { resolveOld = resolve })
    const newer = mapRegistrationReferences({ ...response(), version: 'b'.repeat(64) })
    const load = vi.fn().mockReturnValueOnce(oldResponse).mockResolvedValueOnce(newer)
    const store = useRegistrationReferenceStore(); store.configure({ load })
    const oldRequest = store.ensureLoaded(context)
    await store.ensureLoaded({ ...context, endpoint: 'https://new.example/api/frontend' })
    resolveOld(mapRegistrationReferences(response()))
    await oldRequest
    expect(store.version).toBe('b'.repeat(64))
  })
})

describe('registration reference UI contract', () => {
  const page = readFileSync(new URL('../src/pages/RegistrationIntakePage.vue', import.meta.url), 'utf8')
  const combo = readFileSync(new URL('../src/features/reference-data/components/SearchableReferenceCombobox.vue', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
  it('uses native selects, an accessible searchable combobox and explicit legacy mode', () => {
    expect(page).toContain('select select-bordered')
    expect(page).toContain('SearchableReferenceCombobox')
    expect(page).toContain('referenceVersion')
    expect(page).toContain("referenceMode === 'LEGACY'")
    expect(combo).toContain('role="combobox"')
    expect(combo).toContain('role="listbox"')
    expect(combo).toContain('min-h-11')
    expect(app).toContain('referenceData.ensureLoaded')
  })
})
