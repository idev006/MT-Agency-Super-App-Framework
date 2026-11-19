import process from 'node:process'
import { pathToFileURL } from 'node:url'

const DEFAULT_ORGANIZATION_NAME = 'หน่วยงานทดสอบ P6'
const CAMPAIGN_START = '2026-11-20T00:00:00.000Z'
const CAMPAIGN_END = '2030-12-31T23:59:59.000Z'

function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`MISSING_${name}`)
  return value.trim()
}

function operationParts(operation) {
  const separator = operation.indexOf('.')
  if (separator < 1) throw new Error('INVALID_OPERATION')
  return [operation.slice(0, separator), operation.slice(separator + 1)]
}

export function createGasCaller({ fetchImpl, endpoint }) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl is required')
  const target = required(endpoint, 'GAS_EXEC_URL')
  return async (operation, payload = {}, sessionToken = '') => {
    const [group, action] = operationParts(operation)
    const response = await fetchImpl(target, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({
        apiVersion: 'v1', group, action, payload,
        requestId: `seed-${crypto.randomUUID()}`,
        ...(sessionToken ? { sessionToken } : {}),
      }),
    })
    if (!response.ok) throw new Error(`HTTP_${response.status}`)
    const envelope = await response.json()
    if (!envelope?.ok) throw new Error(envelope?.error?.code || 'API_ERROR')
    return envelope.data
  }
}

export async function bootstrapSystemAdminRecords({ call, username, password }) {
  const login = await call('auth.login', { username: required(username, 'USERNAME'), password: required(password, 'PASSWORD') })
  const token = required(login?.sessionToken, 'SESSION_TOKEN')
  const summary = { settingsUpdated: false, organizationCreated: false, campaignCreated: false }
  try {
    const session = await call('auth.session', {}, token)
    if (!Array.isArray(session?.roles) || !session.roles.includes('SYSTEM_ADMIN')) throw new Error('SYSTEM_ADMIN_REQUIRED')
    if (session.mustChangePassword === true) throw new Error('PASSWORD_CHANGE_REQUIRED')

    const settings = await call('system.config.get', {}, token)
    const missingSettings = {}
    if (settings?.idle_timeout_minutes === null || settings?.idle_timeout_minutes === undefined) missingSettings.idle_timeout_minutes = 30
    if (settings?.retention_days === null || settings?.retention_days === undefined) missingSettings.retention_days = 365
    if (Object.keys(missingSettings).length) {
      await call('system.config.update', { values: missingSettings }, token)
      summary.settingsUpdated = true
    }

    const organizations = await call('organizations.list', { limit: 500 }, token)
    const existingOrganization = organizations.find((row) => row.name === DEFAULT_ORGANIZATION_NAME && row.status === 'ACTIVE')
    if (!existingOrganization) {
      await call('organizations.create', { name: DEFAULT_ORGANIZATION_NAME, type: 'POLICE' }, token)
      summary.organizationCreated = true
    }

    const campaigns = await call('campaigns.list', { limit: 100 }, token)
    const existingCampaign = campaigns.find((row) => row.startsAt === CAMPAIGN_START && row.endsAt === CAMPAIGN_END && row.status === 'ACTIVE')
    if (!existingCampaign) {
      await call('campaigns.create', { startsAt: CAMPAIGN_START, endsAt: CAMPAIGN_END, maxSubmissions: 100 }, token)
      summary.campaignCreated = true
    }
    return summary
  } finally {
    await call('auth.logout', {}, token).catch(() => undefined)
  }
}

async function main() {
  const call = createGasCaller({ fetchImpl: fetch, endpoint: process.env.P6VC_GAS_EXEC_URL })
  const summary = await bootstrapSystemAdminRecords({
    call,
    username: process.env.P6VC_HTTP_LOGIN_USERNAME || 'admin',
    password: process.env.P6VC_HTTP_LOGIN_PASSWORD,
  })
  console.log(`PASS bootstrap records: settings=${summary.settingsUpdated ? 'updated' : 'unchanged'}, organization=${summary.organizationCreated ? 'created' : 'existing'}, campaign=${summary.campaignCreated ? 'created' : 'existing'}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`FAIL bootstrap records: ${error.message}`)
    process.exitCode = 1
  })
}
