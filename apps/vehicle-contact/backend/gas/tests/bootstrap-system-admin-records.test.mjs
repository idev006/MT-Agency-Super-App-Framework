import assert from 'node:assert/strict'
import test from 'node:test'
import { bootstrapSystemAdminRecords } from '../scripts/bootstrap-system-admin-records.mjs'

function fixture({ mustChangePassword = false, existing = false } = {}) {
  const operations = []
  const call = async (operation) => {
    operations.push(operation)
    if (operation === 'auth.login') return { sessionToken: 'a'.repeat(64) }
    if (operation === 'auth.session') return { roles: ['SYSTEM_ADMIN'], mustChangePassword }
    if (operation === 'system.config.get') return existing ? { idle_timeout_minutes: 30, retention_days: 365 } : { idle_timeout_minutes: null, retention_days: null }
    if (operation === 'organizations.list') return existing ? [{ name: 'หน่วยงานทดสอบ P6', status: 'ACTIVE' }] : []
    if (operation === 'campaigns.list') return existing ? [{ startsAt: '2026-11-20T00:00:00.000Z', endsAt: '2030-12-31T23:59:59.000Z', status: 'ACTIVE' }] : []
    return { ok: true }
  }
  return { call, operations }
}

test('creates only missing synthetic administration records and logs out', async () => {
  const { call, operations } = fixture()
  const result = await bootstrapSystemAdminRecords({ call, username: 'admin', password: 'synthetic-password' })
  assert.deepEqual(result, { settingsUpdated: true, organizationCreated: true, campaignCreated: true })
  for (const operation of ['system.config.update', 'organizations.create', 'campaigns.create', 'auth.logout']) assert.ok(operations.includes(operation))
})

test('is idempotent when records already exist', async () => {
  const { call, operations } = fixture({ existing: true })
  const result = await bootstrapSystemAdminRecords({ call, username: 'admin', password: 'synthetic-password' })
  assert.deepEqual(result, { settingsUpdated: false, organizationCreated: false, campaignCreated: false })
  assert.equal(operations.some((operation) => operation.endsWith('.create') || operation === 'system.config.update'), false)
  assert.equal(operations.at(-1), 'auth.logout')
})

test('fails closed while the initial password policy is active', async () => {
  const { call, operations } = fixture({ mustChangePassword: true })
  await assert.rejects(() => bootstrapSystemAdminRecords({ call, username: 'admin', password: 'synthetic-password' }), /PASSWORD_CHANGE_REQUIRED/)
  assert.equal(operations.at(-1), 'auth.logout')
})
