import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { createGasCaller } from './bootstrap-system-admin-records.mjs'

export const ADMIN_FULL_ACCESS_ROLES = Object.freeze(['SYSTEM_ADMIN', 'REGISTRATION_ADMIN'])
const REQUIRED_PERMISSIONS = Object.freeze(['users.manage', 'vehicle.registration.approve', 'vehicle.lookup', 'audit.read'])

const sameValues = (left, right) => Array.isArray(left) && left.slice().sort().join('|') === right.slice().sort().join('|')
const required = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`MISSING_${name}`)
  return value.trim()
}

export async function grantAdminFullAccess({ call, username, password }) {
  const credentials = { username: required(username, 'USERNAME'), password: required(password, 'PASSWORD') }
  let token = ''
  let changed = false
  try {
    token = required((await call('auth.login', credentials))?.sessionToken, 'SESSION_TOKEN')
    const before = await call('auth.session', {}, token)
    if (!Array.isArray(before?.roles) || !before.roles.includes('SYSTEM_ADMIN')) throw new Error('SYSTEM_ADMIN_REQUIRED')
    if (before.mustChangePassword === true) throw new Error('PASSWORD_CHANGE_REQUIRED')

    if (!sameValues(before.roles, ADMIN_FULL_ACCESS_ROLES)) {
      const result = await call('users.assignRoles', { userId: required(before.userId, 'USER_ID'), roles: [...ADMIN_FULL_ACCESS_ROLES] }, token)
      if (!sameValues(result?.roles, ADMIN_FULL_ACCESS_ROLES)) throw new Error('ROLE_ASSIGNMENT_MISMATCH')
      changed = true
      token = '' // users.assignRoles revokes every target session, including this one.
    } else {
      await call('auth.logout', {}, token)
      token = ''
    }

    token = required((await call('auth.login', credentials))?.sessionToken, 'SESSION_TOKEN')
    const verified = await call('auth.session', {}, token)
    if (!sameValues(verified?.roles, ADMIN_FULL_ACCESS_ROLES)) throw new Error('ROLE_VERIFICATION_FAILED')
    if (!Array.isArray(verified.permissions) || REQUIRED_PERMISSIONS.some(permission => !verified.permissions.includes(permission))) throw new Error('PERMISSION_UNION_INCOMPLETE')
    if (verified.permissions.includes('retention.worker')) throw new Error('WORKER_PERMISSION_MUST_BE_ISOLATED')
    return { changed, verified: true, roles: [...ADMIN_FULL_ACCESS_ROLES] }
  } finally {
    if (token) await call('auth.logout', {}, token).catch(() => undefined)
  }
}

async function main() {
  const call = createGasCaller({ fetchImpl: fetch, endpoint: process.env.P6VC_GAS_EXEC_URL })
  const result = await grantAdminFullAccess({
    call,
    username: process.env.P6VC_HTTP_LOGIN_USERNAME || 'admin',
    password: process.env.P6VC_HTTP_LOGIN_PASSWORD,
  })
  console.log(`PASS admin full human access: roles=${result.roles.join('+')}; assignment=${result.changed ? 'changed' : 'already-correct'}; credentials/session=redacted`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`FAIL admin full human access: ${error.message}`)
    process.exitCode = 1
  })
}
