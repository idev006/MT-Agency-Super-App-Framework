import trustedEndpoints from '../../../../contracts/trusted-endpoints.v1.json'

const coreOrigin = trustedEndpoints.endpoints.find((item) => item.id === 'cloud-run-core')?.url
const CORE_GATEWAY_URL = coreOrigin ? `${coreOrigin}/api/frontend` : ''
// Dev-only: a local API/mock gateway. Never accepted in production builds.
const DEV_LOCAL_BRIDGE_URL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api\/frontend$/

export class CoreApiError extends Error {
  constructor(message, { code = 'CLIENT_ERROR', requestId = '', cause } = {}) {
    super(message, { cause })
    this.name = 'CoreApiError'
    this.code = code
    this.requestId = requestId
  }
}

export class CoreApiClient {
  constructor({ endpoint, timeoutMs = 20_000, fetchImpl = globalThis.fetch } = {}) {
    this.endpoint = endpoint
    this.timeoutMs = timeoutMs
    // Native window.fetch requires Window as its receiver in some browsers.
    this.fetchImpl = fetchImpl.bind(globalThis)
  }

  setEndpoint(endpoint) {
    this.endpoint = String(endpoint || '').trim()
  }

  async call(operation, payload = {}, { sessionToken, signal } = {}) {
    if (!isValidApiEndpoint(this.endpoint)) {
      throw new CoreApiError('URL ของ API endpoint ไม่ถูกต้อง', { code: 'INVALID_ENDPOINT' })
    }

    const separator = operation.indexOf('.')
    if (separator < 1 || separator === operation.length - 1) {
      throw new CoreApiError('ชื่อ operation ไม่ถูกต้อง', { code: 'INVALID_OPERATION' })
    }

    const requestId = globalThis.crypto?.randomUUID?.() || `web-${Date.now()}`
    const timeoutController = new AbortController()
    const timer = setTimeout(() => timeoutController.abort('timeout'), this.timeoutMs)
    const abortFromCaller = () => timeoutController.abort(signal?.reason)
    signal?.addEventListener('abort', abortFromCaller, { once: true })

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        redirect: 'follow',
        signal: timeoutController.signal,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          apiVersion: 'v1',
          group: operation.slice(0, separator),
          action: operation.slice(separator + 1),
          payload,
          requestId,
          ...(sessionToken ? { sessionToken } : {}),
        }),
      })

      if (!response.ok) {
        throw new CoreApiError(`ระบบตอบกลับผิดปกติ (HTTP ${response.status})`, {
          code: `HTTP_${response.status}`,
          requestId,
        })
      }

      let envelope
      try {
        envelope = await response.json()
      } catch (cause) {
        throw new CoreApiError('ระบบตอบกลับในรูปแบบที่ไม่ถูกต้อง', {
          code: 'INVALID_JSON',
          requestId,
          cause,
        })
      }

      if (!envelope || typeof envelope.ok !== 'boolean' || !('data' in envelope) || !('error' in envelope)) {
        throw new CoreApiError('รูปแบบข้อมูลตอบกลับจากระบบไม่ตรงตามสัญญา', {
          code: 'INVALID_ENVELOPE',
          requestId: envelope?.requestId || requestId,
        })
      }

      if (!envelope.ok) {
        throw new CoreApiError(envelope.error?.message || 'ระบบปฏิเสธคำขอ', {
          code: envelope.error?.code || 'API_ERROR',
          requestId: envelope.requestId || requestId,
        })
      }

      return {
        data: envelope.data,
        requestId: envelope.requestId || requestId,
      }
    } catch (error) {
      if (error instanceof CoreApiError) throw error
      if (timeoutController.signal.aborted) {
        throw new CoreApiError('การเชื่อมต่อใช้เวลานานเกินกำหนด', {
          code: signal?.aborted ? 'REQUEST_ABORTED' : 'TIMEOUT',
          requestId,
          cause: error,
        })
      }
      throw new CoreApiError('เชื่อมต่อระบบไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่', {
        code: 'NETWORK_ERROR',
        requestId,
        cause: error,
      })
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abortFromCaller)
    }
  }
}

export function isValidApiEndpoint(endpoint) {
  const value = String(endpoint || '').trim()
  if (import.meta.env?.DEV && DEV_LOCAL_BRIDGE_URL.test(value)) return true
  return Boolean(CORE_GATEWAY_URL) && value === CORE_GATEWAY_URL
}
