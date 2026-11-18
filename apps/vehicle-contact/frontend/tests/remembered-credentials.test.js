import { describe, expect, it } from 'vitest'
import { loadRememberedCredentials, saveRememberedCredentials } from '../src/application/auth/remembered-credentials.js'

function memoryStorage() {
  const data = new Map()
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) }
}

describe('remembered credentials POC policy', () => {
  it('stores username without password by default', () => {
    const storage = memoryStorage()
    saveRememberedCredentials({ username: 'staff', password: 'secret', rememberUsername: true, rememberPassword: false }, storage)
    expect(loadRememberedCredentials(storage)).toEqual({ username: 'staff', password: '', rememberUsername: true, rememberPassword: false })
  })

  it('stores password only after explicit opt-in and removes it after opt-out', () => {
    const storage = memoryStorage()
    saveRememberedCredentials({ username: 'staff', password: 'poc-only', rememberUsername: true, rememberPassword: true }, storage)
    expect(loadRememberedCredentials(storage).password).toBe('poc-only')
    saveRememberedCredentials({ username: 'staff', password: 'ignored', rememberUsername: true, rememberPassword: false }, storage)
    expect(loadRememberedCredentials(storage).password).toBe('')
  })
})
