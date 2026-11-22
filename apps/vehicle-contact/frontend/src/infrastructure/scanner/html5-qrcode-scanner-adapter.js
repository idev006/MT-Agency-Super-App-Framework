const REAR_CAMERA = /back|rear|environment|world|ด้านหลัง|กล้องหลัง/i
const FRONT_CAMERA = /front|face|user|ด้านหน้า|กล้องหน้า/i

function scannerError(error, fallback = 'CAMERA_UNAVAILABLE', secure = globalThis.isSecureContext) {
  const name = String(error?.name || '')
  const message = String(error?.message || error || '')
  let code = fallback
  if (!secure) code = 'INSECURE_CONTEXT'
  else if (/NotAllowed|Permission|denied/i.test(`${name} ${message}`)) code = 'CAMERA_PERMISSION_DENIED'
  else if (/NotFound|DevicesNotFound|Overconstrained/i.test(`${name} ${message}`)) code = 'CAMERA_NOT_FOUND'
  else if (/NotReadable|TrackStart/i.test(`${name} ${message}`)) code = 'CAMERA_BUSY'
  return Object.assign(new Error(code), { code })
}

function stopElementTracks(elementId, documentRef) {
  const root = documentRef?.getElementById(elementId)
  root?.querySelectorAll('video').forEach((video) => {
    try {
      video.srcObject?.getTracks?.().forEach((track) => {
        try { track.stop() } catch { /* continue releasing the remaining tracks */ }
      })
    } finally {
      video.srcObject = null
    }
  })
}

export function createHtml5QrCodeScannerAdapter({
  loadLibrary = () => import('html5-qrcode'),
  documentRef = globalThis.document,
  secureContext = () => globalThis.isSecureContext,
} = {}) {
  let engine = null
  let started = false
  let activeElementId = ''
  let operation = 0

  async function library() {
    try {
      return await loadLibrary()
    } catch {
      throw Object.assign(new Error('DECODER_UNAVAILABLE'), { code: 'DECODER_UNAVAILABLE' })
    }
  }

  async function stop() {
    operation += 1
    const current = engine
    const elementId = activeElementId
    engine = null
    activeElementId = ''
    if (current && started) {
      try { await current.stop() } catch { /* tracks are stopped below */ }
    }
    started = false
    try { current?.clear() } catch { /* an unstarted decoder may reject clear */ }
    if (elementId) stopElementTracks(elementId, documentRef)
  }

  async function cameras(Html5Qrcode) {
    try {
      const items = await Html5Qrcode.getCameras()
      return Array.isArray(items) ? items.map((item) => ({ id: item.id, label: item.label || 'กล้องที่ไม่ระบุชื่อ' })) : []
    } catch {
      return []
    }
  }

  return Object.freeze({
    async start({ elementId, facingMode = 'environment', cameraId = '', onDecode }) {
      if (!secureContext()) throw scannerError(null, 'CAMERA_UNAVAILABLE', false)
      await stop()
      const run = operation
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await library()
      const available = await cameras(Html5Qrcode)
      const preferredPattern = facingMode === 'user' ? FRONT_CAMERA : REAR_CAMERA
      const preferred = available.find((item) => preferredPattern.test(item.label))
      const candidates = cameraId ? [cameraId] : [
        ...(preferred ? [preferred.id] : []),
        { facingMode: { exact: facingMode } },
        { facingMode },
      ]
      let lastError = null
      for (const candidate of candidates) {
        if (run !== operation) throw Object.assign(new Error('SCANNER_STOPPED'), { code: 'SCANNER_STOPPED' })
        let candidateEngine = null
        try {
          candidateEngine = new Html5Qrcode(elementId, { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false })
          engine = candidateEngine
          activeElementId = elementId
          await candidateEngine.start(candidate, { fps: 5, disableFlip: false }, onDecode, () => {})
          if (run !== operation || engine !== candidateEngine) {
            try { await candidateEngine.stop() } catch { /* fallback tracks are stopped below */ }
            try { candidateEngine.clear() } catch { /* already cleared */ }
            stopElementTracks(elementId, documentRef)
            throw Object.assign(new Error('SCANNER_STOPPED'), { code: 'SCANNER_STOPPED' })
          }
          started = true
          const discovered = await cameras(Html5Qrcode)
          const track = documentRef?.getElementById(elementId)?.querySelector?.('video')?.srcObject?.getVideoTracks?.()[0]
          return { devices: discovered, requestedFacingMode: facingMode, activeFacingMode: track?.getSettings?.().facingMode || '' }
        } catch (error) {
          lastError = error
          try { candidateEngine?.clear() } catch { /* failed start has no active scanner */ }
          if (engine === candidateEngine) {
            engine = null
            activeElementId = ''
          }
          stopElementTracks(elementId, documentRef)
          if (run !== operation || error?.code === 'SCANNER_STOPPED') throw error
        }
      }
      await stop()
      throw scannerError(lastError, 'CAMERA_UNAVAILABLE', secureContext())
    },

    async scanFile({ elementId, file }) {
      await stop()
      const run = operation
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await library()
      try {
        engine = new Html5Qrcode(elementId, { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false })
        activeElementId = elementId
        const text = await engine.scanFile(file, false)
        if (run !== operation) throw Object.assign(new Error('SCANNER_STOPPED'), { code: 'SCANNER_STOPPED' })
        return text
      } catch (error) {
        throw scannerError(error, 'QR_FILE_NOT_READABLE', secureContext())
      } finally {
        await stop()
      }
    },

    stop,
  })
}
