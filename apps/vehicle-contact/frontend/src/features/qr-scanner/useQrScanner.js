import { computed, ref } from 'vue'
import { assertQrScanner } from '../../application/scanner/qr-scanner-port.js'
import { codeFromScan } from '../../domain/qr/vehicle-qr-link.js'

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_IMAGE_BYTES = 10_000_000
const QR_TOKEN = /^[a-f0-9]{64}$/i

export function useQrScanner({ scanner, elementId, onDecoded }) {
  const source = assertQrScanner(scanner)
  const phase = ref('idle')
  const failure = ref(null)
  const devices = ref([])
  const facingMode = ref('environment')
  const selectedDeviceId = ref('')
  const activeFacingMode = ref('')
  // Owner 2026-11-25 (real phone): "สแกน QR ... ทำให้กล้องปิดตัวลง". A QR that is not a vehicle QR
  // (e.g. the campaign registration link) used to STOP the camera. Now the camera keeps running and
  // a notice says what was read; the same non-vehicle QR is not reported again for a moment.
  const notice = ref('')
  let lastIgnored = ''
  let lastIgnoredAt = 0
  let decoding = false
  let lifecycleBound = false
  let generation = 0
  let disposed = false

  const active = computed(() => ['starting', 'scanning', 'switching'].includes(phase.value))
  const busy = computed(() => ['starting', 'switching', 'stopping', 'scanning-file', 'decoded'].includes(phase.value))

  function capture(error) {
    failure.value = { code: typeof error?.code === 'string' ? error.code : 'CAMERA_UNAVAILABLE' }
    phase.value = 'error'
  }

  async function handleDecoded(text) {
    if (decoding) return
    decoding = true
    const read = String(text || '').trim()
    // VC-ADR-032 (A): this app's /q/ link or the bare code; anything else is not a vehicle QR.
    const candidate = codeFromScan(read) || read
    if (!QR_TOKEN.test(candidate) && phase.value === 'scanning') {
      const now = Date.now()
      if (read !== lastIgnored || now - lastIgnoredAt > 3000) notice.value = /^https?:\/\//i.test(read) ? 'LINK_NOT_VEHICLE_QR' : 'NOT_VEHICLE_QR'
      lastIgnored = read; lastIgnoredAt = now
      decoding = false
      return
    }
    if (!QR_TOKEN.test(candidate)) {
      try {
        await source.stop()
        failure.value = { code: 'INVALID_QR' }
        phase.value = 'error'
      } finally {
        decoding = false
      }
      return
    }
    phase.value = 'decoded'
    notice.value = ''
    try {
      await source.stop()
      await onDecoded(candidate.toLowerCase())
    } finally {
      decoding = false
      if (phase.value === 'decoded') phase.value = 'idle'
    }
  }

  async function start({ cameraId = selectedDeviceId.value, nextFacingMode = facingMode.value } = {}) {
    if (busy.value || disposed) return false
    const run = ++generation
    phase.value = cameraId || active.value ? 'switching' : 'starting'
    failure.value = null
    notice.value = ''
    try {
      const result = await source.start({ elementId, cameraId, facingMode: nextFacingMode, onDecode: handleDecoded })
      if (disposed || run !== generation) {
        await source.stop()
        return false
      }
      facingMode.value = nextFacingMode
      devices.value = result.devices || []
      activeFacingMode.value = result.activeFacingMode || ''
      selectedDeviceId.value = cameraId || ''
      phase.value = 'scanning'
      return true
    } catch (error) {
      await source.stop()
      if (disposed || run !== generation || error?.code === 'SCANNER_STOPPED') return false
      capture(error)
      return false
    }
  }

  async function stop() {
    if (phase.value === 'stopping') return
    generation += 1
    phase.value = 'stopping'
    await source.stop()
    phase.value = 'idle'
  }

  async function switchCamera() {
    const next = facingMode.value === 'environment' ? 'user' : 'environment'
    selectedDeviceId.value = ''
    generation += 1
    await source.stop()
    phase.value = 'idle'
    return start({ cameraId: '', nextFacingMode: next })
  }

  async function selectDevice(cameraId) {
    selectedDeviceId.value = cameraId
    generation += 1
    await source.stop()
    phase.value = 'idle'
    return start({ cameraId, nextFacingMode: facingMode.value })
  }

  async function scanFile(file) {
    if (!file || !ALLOWED_IMAGE_TYPES.has(file.type) || file.size < 1 || file.size > MAX_IMAGE_BYTES) {
      capture({ code: 'INVALID_QR_IMAGE' })
      return false
    }
    const run = ++generation
    await source.stop()
    phase.value = 'scanning-file'
    failure.value = null
    try {
      const text = await source.scanFile({ elementId, file })
      if (disposed || run !== generation) return false
      await handleDecoded(text)
      return true
    } catch (error) {
      await source.stop()
      if (disposed || run !== generation || error?.code === 'SCANNER_STOPPED') return false
      capture(error)
      return false
    }
  }

  const leave = () => {
    generation += 1
    phase.value = 'idle'
    source.stop().catch(() => {})
  }
  const hide = () => { if (globalThis.document?.hidden) leave() }

  function bindLifecycle() {
    if (lifecycleBound) return
    lifecycleBound = true
    globalThis.addEventListener?.('pagehide', leave)
    globalThis.document?.addEventListener?.('visibilitychange', hide)
  }

  async function destroy() {
    globalThis.removeEventListener?.('pagehide', leave)
    globalThis.document?.removeEventListener?.('visibilitychange', hide)
    lifecycleBound = false
    disposed = true
    generation += 1
    await source.stop()
  }

  return { phase, failure, notice, devices, facingMode, activeFacingMode, selectedDeviceId, active, busy, start, stop, switchCamera, selectDevice, scanFile, bindLifecycle, destroy }
}
