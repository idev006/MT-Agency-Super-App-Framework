import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { useQrScanner } from '../src/features/qr-scanner/useQrScanner.js'
import { createHtml5QrCodeScannerAdapter } from '../src/infrastructure/scanner/html5-qrcode-scanner-adapter.js'

function fakeScanner() {
  return { start: vi.fn(), stop: vi.fn().mockResolvedValue(), scanFile: vi.fn() }
}

describe('QR camera scanner state and privacy contract', () => {
  it('starts only on explicit action with rear-facing preference', async () => {
    const scanner = fakeScanner()
    scanner.start.mockResolvedValue({ devices: [{ id: 'rear', label: 'Back Camera' }], facingMode: 'environment' })
    const work = useQrScanner({ scanner, elementId: 'reader', onDecoded: vi.fn() })
    expect(scanner.start).not.toHaveBeenCalled()
    await work.start()
    expect(scanner.start).toHaveBeenCalledWith(expect.objectContaining({ elementId: 'reader', facingMode: 'environment', cameraId: '' }))
    expect(work.phase.value).toBe('scanning')
  })

  it('stops before one decoded value is forwarded and ignores a concurrent duplicate', async () => {
    const scanner = fakeScanner()
    let decode
    scanner.start.mockImplementation(async ({ onDecode }) => { decode = onDecode; return { devices: [] } })
    let release
    const onDecoded = vi.fn().mockImplementation(() => new Promise((resolve) => { release = resolve }))
    const work = useQrScanner({ scanner, elementId: 'reader', onDecoded })
    await work.start()
    const first = decode('a'.repeat(64))
    await Promise.resolve()
    const duplicate = decode('b'.repeat(64))
    expect(scanner.stop).toHaveBeenCalled()
    expect(onDecoded).toHaveBeenCalledTimes(1)
    release()
    await Promise.all([first, duplicate])
  })

  it('a non-vehicle QR (URL or text) never resolves a vehicle and KEEPS the camera running (owner 2026-11-25)', async () => {
    const scanner = fakeScanner()
    let decode
    scanner.start.mockImplementation(async ({ onDecode }) => { decode = onDecode; return { devices: [] } })
    const onDecoded = vi.fn()
    const work = useQrScanner({ scanner, elementId: 'reader', onDecoded })
    await work.start()
    await decode('https://example.test/qr?token=' + 'a'.repeat(64))
    expect(onDecoded).not.toHaveBeenCalled()
    expect(scanner.stop).not.toHaveBeenCalled()
    expect(work.phase.value).toBe('scanning')
    expect(work.notice.value).toBe('LINK_NOT_VEHICLE_QR')
    await decode('hello')
    expect(work.notice.value).toBe('NOT_VEHICLE_QR')
    await decode('c'.repeat(64))
    expect(onDecoded).toHaveBeenCalledWith('c'.repeat(64))
    expect(work.notice.value).toBe('')
  })

  it('a non-vehicle QR read from an image file is still an error (no camera to keep)', async () => {
    const scanner = fakeScanner()
    scanner.scanFile.mockResolvedValue('https://example.test/x')
    const work = useQrScanner({ scanner, elementId: 'reader', onDecoded: vi.fn() })
    await work.scanFile({ type: 'image/png', size: 10 })
    expect(work.failure.value).toEqual({ code: 'INVALID_QR' })
  })

  it('stops before switching camera or selecting a device', async () => {
    const scanner = fakeScanner()
    scanner.start.mockResolvedValue({ devices: [{ id: 'a' }, { id: 'b' }] })
    const work = useQrScanner({ scanner, elementId: 'reader', onDecoded: vi.fn() })
    await work.start()
    await work.switchCamera()
    expect(scanner.stop).toHaveBeenCalled()
    expect(scanner.start).toHaveBeenLastCalledWith(expect.objectContaining({ facingMode: 'user', cameraId: '' }))
    await work.stop()
    await work.selectDevice('b')
    expect(scanner.start).toHaveBeenLastCalledWith(expect.objectContaining({ cameraId: 'b' }))
  })

  it('supports bounded image fallback and destroys tracks on teardown', async () => {
    const scanner = fakeScanner()
    scanner.scanFile.mockResolvedValue('a'.repeat(64))
    const onDecoded = vi.fn()
    const work = useQrScanner({ scanner, elementId: 'reader', onDecoded })
    await work.scanFile({ type: 'image/png', size: 1200 })
    expect(onDecoded).toHaveBeenCalledTimes(1)
    await work.destroy()
    expect(scanner.stop).toHaveBeenCalled()
  })

  it('discards a camera start that completes after teardown', async () => {
    const scanner = fakeScanner()
    let release
    scanner.start.mockReturnValue(new Promise((resolve) => { release = resolve }))
    const work = useQrScanner({ scanner, elementId: 'reader', onDecoded: vi.fn() })
    const pending = work.start()
    const destroying = work.destroy()
    release({ devices: [] })
    await Promise.all([pending, destroying])
    expect(work.phase.value).not.toBe('scanning')
    expect(scanner.stop).toHaveBeenCalled()
  })

  it('binds page lifecycle cleanup before the reader DOM is removed', () => {
    const page = readFileSync(new URL('../src/pages/QrResolvePage.vue', import.meta.url), 'utf8')
    const composable = readFileSync(new URL('../src/features/qr-scanner/useQrScanner.js', import.meta.url), 'utf8')
    expect(page).toContain('onBeforeUnmount')
    expect(page).not.toContain('onUnmounted')
    expect(composable).toContain("addEventListener?.('pagehide'")
    expect(composable).toContain("addEventListener?.('visibilitychange'")
  })

  it('keeps decoded data out of the presentational UI and pins the decoder dependency', () => {
    const panel = readFileSync(new URL('../src/features/qr-scanner/components/QrScannerPanel.vue', import.meta.url), 'utf8')
    const adapter = readFileSync(new URL('../src/infrastructure/scanner/html5-qrcode-scanner-adapter.js', import.meta.url), 'utf8')
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    expect(pkg.dependencies['html5-qrcode']).toBe('2.3.8')
    expect(adapter).toContain("import('html5-qrcode')")
    expect(panel).not.toContain('decodedText')
    expect(panel).not.toContain('localStorage')
    expect(panel).not.toContain('sessionStorage')
    expect(panel).toContain('accept="image/jpeg,image/png,image/webp"')
  })

  it('stops a real adapter engine that starts after a lifecycle stop', async () => {
    const track = { stop: vi.fn(), getSettings: vi.fn().mockReturnValue({ facingMode: 'environment' }) }
    const video = { srcObject: { getTracks: () => [track], getVideoTracks: () => [track] } }
    const documentRef = { getElementById: () => ({ querySelectorAll: () => [video], querySelector: () => video }) }
    let release
    const instances = []
    class Html5Qrcode {
      static getCameras = vi.fn().mockResolvedValue([])
      constructor() { this.start = vi.fn(() => new Promise((resolve) => { release = resolve })); this.stop = vi.fn().mockResolvedValue(); this.clear = vi.fn(); instances.push(this) }
    }
    const adapter = createHtml5QrCodeScannerAdapter({
      loadLibrary: async () => ({ Html5Qrcode, Html5QrcodeSupportedFormats: { QR_CODE: 0 } }), documentRef, secureContext: () => true,
    })
    const pending = adapter.start({ elementId: 'reader', facingMode: 'environment', onDecode: vi.fn() })
    while (!release) await Promise.resolve()
    await adapter.stop()
    release()
    await expect(pending).rejects.toMatchObject({ code: 'SCANNER_STOPPED' })
    expect(instances[0].stop).toHaveBeenCalled()
    expect(instances[0].clear).toHaveBeenCalled()
    expect(track.stop).toHaveBeenCalled()
  })

  it('runs track fallback after every failed adapter start candidate', async () => {
    const tracks = []
    const video = { srcObject: null }
    const documentRef = { getElementById: () => ({ querySelectorAll: () => [video], querySelector: () => video }) }
    class Html5Qrcode {
      static getCameras = vi.fn().mockResolvedValue([])
      constructor() {
        this.start = vi.fn().mockImplementation(async () => {
          const track = { stop: vi.fn() }
          tracks.push(track)
          video.srcObject = { getTracks: () => [track] }
          throw new Error('not readable')
        })
        this.clear = vi.fn()
      }
    }
    const adapter = createHtml5QrCodeScannerAdapter({
      loadLibrary: async () => ({ Html5Qrcode, Html5QrcodeSupportedFormats: { QR_CODE: 0 } }), documentRef, secureContext: () => true,
    })
    await expect(adapter.start({ elementId: 'reader', facingMode: 'environment', onDecode: vi.fn() })).rejects.toMatchObject({ code: 'CAMERA_UNAVAILABLE' })
    expect(tracks).toHaveLength(2)
    expect(tracks.every((track) => track.stop.mock.calls.length === 1)).toBe(true)
    expect(video.srcObject).toBeNull()
  })

  it('clears the engine and every media track even when cleanup callbacks fail', async () => {
    const failingTrack = { stop: vi.fn(() => { throw new Error('track already ended') }) }
    const remainingTrack = { stop: vi.fn(), getSettings: vi.fn().mockReturnValue({ facingMode: 'environment' }) }
    const stream = { getTracks: () => [failingTrack, remainingTrack], getVideoTracks: () => [remainingTrack] }
    const video = { srcObject: stream }
    const documentRef = { getElementById: () => ({ querySelectorAll: () => [video], querySelector: () => video }) }
    const instances = []
    class Html5Qrcode {
      static getCameras = vi.fn().mockResolvedValue([])
      constructor() {
        this.start = vi.fn().mockResolvedValue()
        this.stop = vi.fn().mockRejectedValue(new Error('engine already stopped'))
        this.clear = vi.fn()
        instances.push(this)
      }
    }
    const adapter = createHtml5QrCodeScannerAdapter({
      loadLibrary: async () => ({ Html5Qrcode, Html5QrcodeSupportedFormats: { QR_CODE: 0 } }), documentRef, secureContext: () => true,
    })
    await adapter.start({ elementId: 'reader', cameraId: 'rear', onDecode: vi.fn() })
    await expect(adapter.stop()).resolves.toBeUndefined()
    expect(instances[0].stop).toHaveBeenCalledTimes(1)
    expect(instances[0].clear).toHaveBeenCalledTimes(1)
    expect(failingTrack.stop).toHaveBeenCalledTimes(1)
    expect(remainingTrack.stop).toHaveBeenCalledTimes(1)
    expect(video.srcObject).toBeNull()
    await expect(adapter.stop()).resolves.toBeUndefined()
  })

  it('clears file-decoder engines on both success and decode failure', async () => {
    const instances = []
    class Html5Qrcode {
      static getCameras = vi.fn().mockResolvedValue([])
      constructor() {
        this.scanFile = instances.length === 0
          ? vi.fn().mockResolvedValue('a'.repeat(64))
          : vi.fn().mockRejectedValue(new Error('decode failed'))
        this.clear = vi.fn()
        instances.push(this)
      }
    }
    const adapter = createHtml5QrCodeScannerAdapter({
      loadLibrary: async () => ({ Html5Qrcode, Html5QrcodeSupportedFormats: { QR_CODE: 0 } }), documentRef: null, secureContext: () => true,
    })
    await expect(adapter.scanFile({ elementId: 'reader', file: { name: 'qr.png' } })).resolves.toBe('a'.repeat(64))
    expect(instances[0].clear).toHaveBeenCalledTimes(1)

    await expect(adapter.scanFile({ elementId: 'reader', file: { name: 'broken.png' } })).rejects.toMatchObject({ code: 'QR_FILE_NOT_READABLE' })
    expect(instances[1].clear).toHaveBeenCalledTimes(1)
  })
})
