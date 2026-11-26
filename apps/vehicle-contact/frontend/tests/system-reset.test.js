// VC-ADR-039: system reset — the repository contract and the page wiring.
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createGasSystemSettingsRepository } from '../src/infrastructure/settings/gas-system-settings-repository.js'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
describe('system reset', () => {
  it('preview maps the counts; execute sends phrase + password + digest + options only', async () => {
    const callOperation = vi.fn()
      .mockResolvedValueOnce({ data: { phrase: 'RESET P6VC', planDigest: 'a'.repeat(64), deleteByTable: { vc_vehicles: 3, bad: 'x' }, keptByTable: { vc_settings: 2 }, deleteTotal: 3, driveFiles: 15 } })
      .mockResolvedValueOnce({ data: { deleted: 3, drive: { status: 'PARTIAL', trashed: 10, more: true } } })
    const repo = createGasSystemSettingsRepository({ callOperation })
    const plan = await repo.resetPreview({ keepUsers: false })
    expect(callOperation).toHaveBeenNthCalledWith(1, 'system.reset.preview', { keepUsers: false, keepCampaigns: false }, { signal: undefined })
    expect(plan).toEqual({ phrase: 'RESET P6VC', planDigest: 'a'.repeat(64), deleteByTable: { vc_vehicles: 3 }, keptByTable: { vc_settings: 2 }, deleteTotal: 3, driveFiles: 15 })
    const out = await repo.resetExecute({ confirmation: 'RESET P6VC', password: 'pw', planDigest: plan.planDigest, keepUsers: false })
    expect(callOperation).toHaveBeenNthCalledWith(2, 'system.reset.execute', { confirmation: 'RESET P6VC', password: 'pw', planDigest: 'a'.repeat(64), keepUsers: false, keepCampaigns: false })
    expect(out).toEqual({ deleted: 3, drive: { status: 'PARTIAL', trashed: 10, more: true } })
  })
  it('the panel is shown only with system.reset; the password is cleared on leave', () => {
    expect(read('../src/pages/SystemSettingsPage.vue')).toContain("includes('system.reset')")
    const panel = read('../src/features/settings/components/SystemResetPanel.vue')
    expect(panel).toContain('onBeforeUnmount(clearSecret)')
    expect(panel).toContain('phrase.value === plan.value.phrase && password.value.length > 0')
  })
})
