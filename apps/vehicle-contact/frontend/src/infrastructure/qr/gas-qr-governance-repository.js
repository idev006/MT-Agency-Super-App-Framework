function mapResult(response, tokenExpected) {
  const data = response?.data
  if (!data || typeof data.vehicleId !== 'string') throw Object.assign(new Error('Invalid QR response'), { code: 'INVALID_ENVELOPE' })
  if (tokenExpected && typeof data.token !== 'string') throw Object.assign(new Error('Invalid QR response'), { code: 'INVALID_ENVELOPE' })
  return { ...data, requestId: response.requestId || '' }
}

export function createGasQrGovernanceRepository({ callOperation }) {
  return Object.freeze({
    issue: async (vehicleId) => mapResult(await callOperation('qr.issue', { vehicleId }), true),
    revoke: async (vehicleId) => mapResult(await callOperation('qr.revoke', { vehicleId }), false),
    replace: async (vehicleId) => mapResult(await callOperation('qr.replace', { vehicleId }), true),
  })
}
