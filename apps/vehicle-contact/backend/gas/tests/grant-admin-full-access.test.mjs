import assert from 'node:assert/strict'
import test from 'node:test'
import { ADMIN_FULL_ACCESS_ROLES, grantAdminFullAccess } from '../scripts/grant-admin-full-access.mjs'

function fixture({ roles = ['SYSTEM_ADMIN', 'STAFF'], permissions } = {}) {
  const operations = [], activePermissions = permissions || ['users.manage', 'vehicle.registration.approve', 'vehicle.lookup', 'audit.read']
  let currentRoles = [...roles]
  const call = async (operation, payload) => {
    operations.push(operation)
    if (operation === 'auth.login') return { sessionToken: 'a'.repeat(64) }
    if (operation === 'auth.session') return { userId: 'u-admin', roles: [...currentRoles], permissions: activePermissions, mustChangePassword: false }
    if (operation === 'users.assignRoles') { currentRoles = [...payload.roles]; return { userId: 'u-admin', roles: [...currentRoles] } }
    if (operation === 'auth.logout') return { revoked: true }
    throw new Error('UNEXPECTED_OPERATION')
  }
  return { call, operations, roles: () => currentRoles }
}

test('assigns exactly the system and registration administrator roles then verifies permissions', async () => {
  const state = fixture()
  const result = await grantAdminFullAccess({ call: state.call, username: 'admin', password: 'synthetic-password' })
  assert.deepEqual(result, { changed: true, verified: true, roles: [...ADMIN_FULL_ACCESS_ROLES] })
  assert.deepEqual(state.roles(), ADMIN_FULL_ACCESS_ROLES)
  assert.equal(state.operations.filter(operation => operation === 'auth.login').length, 2)
  assert.equal(state.operations.at(-1), 'auth.logout')
})

test('is idempotent when the access profile is already exact', async () => {
  const state = fixture({ roles: [...ADMIN_FULL_ACCESS_ROLES] })
  const result = await grantAdminFullAccess({ call: state.call, username: 'admin', password: 'synthetic-password' })
  assert.equal(result.changed, false)
  assert.equal(state.operations.includes('users.assignRoles'), false)
})

test('fails closed when worker permission leaks into the human profile', async () => {
  const state = fixture({ roles: [...ADMIN_FULL_ACCESS_ROLES], permissions: ['users.manage', 'vehicle.registration.approve', 'vehicle.lookup', 'audit.read', 'retention.worker'] })
  await assert.rejects(() => grantAdminFullAccess({ call: state.call, username: 'admin', password: 'synthetic-password' }), /WORKER_PERMISSION_MUST_BE_ISOLATED/)
  assert.equal(state.operations.at(-1), 'auth.logout')
})
