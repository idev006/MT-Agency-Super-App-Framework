export class AccountSecurityContractError extends Error {
  constructor() {
    super('Account security response does not match the contract')
    this.name = 'AccountSecurityContractError'
    this.code = 'INVALID_ACCOUNT_SECURITY_RESPONSE'
    this.requestId = ''
  }
}

function responseData(response, requiredBoolean) {
  if (!response?.data || response.data[requiredBoolean] !== true) throw new AccountSecurityContractError()
  return { ...response.data, requestId: response.requestId || '' }
}

export function createGasAccountSecurityRepository({ callOperation }) {
  if (typeof callOperation !== 'function') throw new TypeError('callOperation is required')
  return Object.freeze({
    async changePassword({ oldPassword, newPassword }, { signal } = {}) {
      return responseData(await callOperation('auth.changePassword', { oldPassword, newPassword }, { signal }), 'changed')
    },
    async linkGoogle({ password, idToken }, { signal } = {}) {
      return responseData(await callOperation('auth.linkGoogle', { password, idToken }, { signal }), 'linked')
    },
  })
}
