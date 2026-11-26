import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import LogPolicySettings from '../src/features/settings/components/LogPolicySettings.vue'
import { daysText, toLogCounts, toLogPolicy, validLogDays } from '../src/domain/settings/log-policy.js'
import { createGasSystemSettingsRepository } from '../src/infrastructure/settings/gas-system-settings-repository.js'
import { defaultLogPolicy, logPolicyList } from '../../backend/gas/src/domain/policies/LogPolicy.js'

const serverList = () => logPolicyList(defaultLogPolicy())

describe('log policy (VC-ADR-040)', () => {
  it('maps the server list with Thai names; an older backend (no list) gives null', () => {
    const p = toLogPolicy(serverList())
    expect(p.map((k) => k.code)).toEqual(['LOOKUP', 'CONTACT', 'PHOTO', 'CHANGE', 'LOGIN'])
    expect(p.find((k) => k.code === 'CONTACT')).toMatchObject({ label: 'ดูเบอร์ติดต่อ', canDisable: false, minDays: 90 })
    expect(toLogPolicy(undefined)).toBeNull()
    expect(toLogPolicy([{ code: 'NOPE', enabled: true, days: 1 }])).toBeNull()
    expect(toLogCounts({ LOOKUP: 3 })).toMatchObject({ LOOKUP: 3, PHOTO: null })
    expect(validLogDays(p[3], 0)).toBe(true)
    expect(validLogDays(p[4], 0)).toBe(false)
    expect(daysText(730)).toBe('730 วัน (2 ปี)')
  })

  it('the repository sends the whole list as values.log_policy', async () => {
    const calls = []
    const repo = createGasSystemSettingsRepository({ callOperation: async (op, payload) => { calls.push([op, payload]); return { data: { idle_timeout_minutes: '30', retention_days: null, log_policy: serverList(), log_counts: null }, requestId: 'r' } } })
    const { settings } = await repo.updateLogPolicy({ policy: toLogPolicy(serverList()) })
    expect(calls[0][1].values.log_policy[2]).toEqual({ code: 'PHOTO', enabled: false, days: 90 })
    expect(settings.logPolicy).toHaveLength(5)
  })

  it('the card locks required logs and shows counts; read-only without manage (clicks: e2e/admin.e2e.js)', async () => {
    const render = (props) => renderToString(createSSRApp({ render: () => h(LogPolicySettings, props) }))
    const html = await render({ policy: toLogPolicy(serverList()), counts: { LOOKUP: 1240 }, canManage: true })
    expect(html.match(/data-log-locked=/g)).toHaveLength(3)
    expect(html.match(/data-log-toggle=/g)).toHaveLength(2)
    expect(html).toContain('1,240')
    expect(html).toContain('data-log-forever="CHANGE"')
    const ro = await render({ policy: toLogPolicy(serverList()), canManage: false })
    expect(ro).not.toContain('data-log-save')
    expect(ro).toContain('365 วัน (1 ปี)')
  })
})
