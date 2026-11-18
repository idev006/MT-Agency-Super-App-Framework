const USERNAME_KEY = 'p6vc-remembered-username'
const PASSWORD_KEY = 'p6vc-poc-remembered-password'

export function loadRememberedCredentials(storage = globalThis.localStorage) {
  if (!storage) return { username: '', password: '', rememberUsername: false, rememberPassword: false }
  const username = storage.getItem(USERNAME_KEY) || ''
  const password = storage.getItem(PASSWORD_KEY) || ''
  return { username, password, rememberUsername: Boolean(username), rememberPassword: Boolean(password) }
}

export function saveRememberedCredentials(
  { username, password, rememberUsername, rememberPassword },
  storage = globalThis.localStorage,
) {
  if (!storage) return
  if (rememberUsername || rememberPassword) storage.setItem(USERNAME_KEY, username)
  else storage.removeItem(USERNAME_KEY)
  if (rememberPassword) storage.setItem(PASSWORD_KEY, password)
  else storage.removeItem(PASSWORD_KEY)
}

export function clearRememberedPassword(storage = globalThis.localStorage) {
  storage?.removeItem(PASSWORD_KEY)
}
