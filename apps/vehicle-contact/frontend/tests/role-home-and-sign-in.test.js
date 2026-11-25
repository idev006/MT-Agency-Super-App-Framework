// R1/R2: role home pending-work counts and the simplified sign-in.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadPendingCount, pendingSourcesFor, PENDING_WORK_SOURCES } from '../src/application/dashboard/pending-work.js'
import { signInMessage } from '../src/application/auth/sign-in-messages.js'
import { defaultTransport } from '../src/stores/session.js'

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')

describe('R2 pending work', () => {
  it('shows a source only for the permission the backend enforces', () => {
    expect(pendingSourcesFor([]).map((s) => s.id)).toEqual([])
    expect(pendingSourcesFor(['vehicle.registration.approve']).map((s) => s.id)).toEqual(['registrations'])
    expect(pendingSourcesFor(['vehicle.change.approve', 'vehicle.registration.approve']).map((s) => s.id)).toEqual(['registrations', 'changes'])
  })

  it('asks for one row and reads the total from the paginated contract', async () => {
    const calls = []
    const repo = { listPending: async (args) => { calls.push(args); return { pagination: { total: 7 } } } }
    const r = await loadPendingCount(PENDING_WORK_SOURCES[0], { registrationReview: repo })
    expect(calls).toEqual([{ page: 1, pageSize: 1 }])
    expect(r).toEqual({ id: 'registrations', status: 'ready', total: 7, errorCode: '' })
  })

  it('reports a failure per source instead of a fake zero', async () => {
    const failing = { listPending: async () => { throw Object.assign(new Error('x'), { code: 'FORBIDDEN' }) } }
    expect(await loadPendingCount(PENDING_WORK_SOURCES[1], { changeReview: failing })).toMatchObject({ status: 'error', total: null, errorCode: 'FORBIDDEN' })
    expect(await loadPendingCount(PENDING_WORK_SOURCES[1], { changeReview: { listPending: async () => ({}) } })).toMatchObject({ status: 'error', errorCode: 'INVALID_RESPONSE' })
    expect(await loadPendingCount(PENDING_WORK_SOURCES[1], {})).toMatchObject({ status: 'error', errorCode: 'NOT_CONFIGURED' })
  })

  it('every source routes to an existing page', () => {
    const router = src('router/index.js')
    for (const s of PENDING_WORK_SOURCES) expect(router).toContain(`name: '${s.route}'`)
  })
})

describe('R1 sign-in', () => {
  it('defaults to the Worker only when a valid Worker endpoint is configured', () => {
    expect(defaultTransport('https://p6vc-api-test-console.thaipoliceregion6.workers.dev/api/frontend')).toBe('worker')
    expect(defaultTransport('')).toBe('direct')
    expect(defaultTransport('http://evil.example/api/frontend')).toBe('direct')
  })

  it('shows Thai guidance for known codes and keeps the client message otherwise', () => {
    expect(signInMessage({ code: 'INVALID_CREDENTIALS', message: 'INVALID_CREDENTIALS' })).toMatch(/ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง/)
    expect(signInMessage({ code: 'HTTP_502', message: 'x' })).toMatch(/ขัดข้องชั่วคราว/)
    expect(signInMessage({ code: 'OTHER', message: 'ข้อความเดิม' })).toBe('ข้อความเดิม')
    expect(signInMessage(null)).toBe('')
  })

  it('no developer wording and no connection settings on the sign-in screen (owner 2026-11-25)', () => {
    const view = src('views/SignInView.vue'), form = src('components/auth/SignInForm.vue')
    for (const word of ['APPLICATION SHELL', 'ยืนยันตัวตนกับ GAS', 'บัญชี development', 'route-mini']) expect(view).not.toContain(word)
    for (const word of ['TransportSelector', 'ตั้งค่าการเชื่อมต่อ', 'GAS', 'Cloudflare']) expect(form).not.toContain(word)
    expect(form).toContain('กรุณาติดต่อผู้ดูแลระบบ')
  })
})
