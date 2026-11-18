const GAS_EXEC_URL = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/
const WORKER_GATEWAY_URL = /^https:\/\/[A-Za-z0-9.-]+\/api\/frontend$/

export class GasApiError extends Error {
  constructor(message, { code = 'CLIENT_ERROR', requestId = '', cause } = {}) {
    super(message, { cause })
    this.name = 'GasApiError'
    this.code = code
    this.requestId = requestId
  }
}

export class GasApiClient {
  constructor({ endpoint, transport = 'direct', timeoutMs = 20_000, fetchImpl = globalThis.fetch } = {}) {
    this.endpoint = endpoint
    this.transport = transport
    this.timeoutMs = timeoutMs
    // Native window.fetch requires Window as its receiver in some browsers.
    this.fetchImpl = fetchImpl.bind(globalThis)
  }

  setEndpoint(endpoint, transport = this.transport) {
    this.endpoint = String(endpoint || '').trim()
    this.transport = transport
  }

  async call(operation, payload = {}, { sessionToken, signal } = {}) {
    if (!isValidApiEndpoint(this.endpoint, this.transport)) {
      throw new GasApiError('URL ของ API endpoint ไม่ถูกต้อง', { code: 'INVALID_ENDPOINT' })
    }

    const separator = operation.indexOf('.')
    if (separator < 1 || separator === operation.length - 1) {
      throw new GasApiError('ชื่อ operation ไม่ถูกต้อง', { code: 'INVALID_OPERATION' })
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
          'content-type': this.transport === 'worker' ? 'application/json' : 'text/plain;charset=UTF-8',
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
        throw new GasApiError(`GAS ตอบกลับด้วย HTTP ${response.status}`, {
          code: `HTTP_${response.status}`,
          requestId,
        })
      }

      let envelope
      try {
        envelope = await response.json()
      } catch (cause) {
        throw new GasApiError('GAS ไม่ได้ตอบกลับเป็น JSON', {
          code: 'INVALID_JSON',
          requestId,
          cause,
        })
      }

      if (!envelope || typeof envelope.ok !== 'boolean' || !('data' in envelope) || !('error' in envelope)) {
        throw new GasApiError('รูปแบบข้อมูลตอบกลับจาก GAS ไม่ตรงตามสัญญา', {
          code: 'INVALID_ENVELOPE',
          requestId: envelope?.requestId || requestId,
        })
      }

      if (!envelope.ok) {
        throw new GasApiError(envelope.error?.message || 'GAS ปฏิเสธคำขอ', {
          code: envelope.error?.code || 'API_ERROR',
          requestId: envelope.requestId || requestId,
        })
      }

      return {
        data: envelope.data,
        requestId: envelope.requestId || requestId,
      }
    } catch (error) {
      if (error instanceof GasApiError) throw error
      if (timeoutController.signal.aborted) {
        throw new GasApiError('การเชื่อมต่อใช้เวลานานเกินกำหนด', {
          code: signal?.aborted ? 'REQUEST_ABORTED' : 'TIMEOUT',
          requestId,
          cause: error,
        })
      }
      throw new GasApiError('เบราว์เซอร์เชื่อมต่อ GAS ไม่สำเร็จ', {
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

export function isValidGasEndpoint(endpoint) {
  return GAS_EXEC_URL.test(String(endpoint || '').trim())
}

export function isValidWorkerEndpoint(endpoint) {
  return WORKER_GATEWAY_URL.test(String(endpoint || '').trim())
}

export function isValidApiEndpoint(endpoint, transport = 'direct') {
  return transport === 'worker' ? isValidWorkerEndpoint(endpoint) : isValidGasEndpoint(endpoint)
}
