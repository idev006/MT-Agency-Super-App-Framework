// Owner 2026-11-25: "สแกน QR บนมือถือจริง ทำให้กล้องปิดตัวลง".
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import VehicleQrImage from '../src/features/qr-governance/components/VehicleQrImage.vue'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('QR scanning on a real phone', () => {
  it('the one-time vehicle code is also shown as a scannable QR image (approval + QR management)', async () => {
    const html = await renderToString(createSSRApp(VehicleQrImage, { token: 'A'.repeat(64) }))
    expect(html).toContain('data:image/gif;base64,')
    expect(html).toContain('ดาวน์โหลดภาพ QR')
    expect(await renderToString(createSSRApp(VehicleQrImage, { token: 'not-a-token' }))).not.toContain('<img')
    expect(read('../src/pages/QrGovernancePage.vue')).toContain('<VehicleQrImage :token="token" />')
    expect(read('../src/pages/RegistrationReviewPage.vue')).toContain('<VehicleQrImage :token="work.oneTimeQr.value.token" />')
  })

  it('after a vehicle QR the result is brought into view and the camera can be reopened in one tap', () => {
    const page = read('../src/pages/QrResolvePage.vue')
    expect(page).toContain("getElementById('qr-result')?.scrollIntoView")
    expect(page).toContain('สแกนคันถัดไป')
    expect(read('../src/features/qr-scanner/components/QrScannerPanel.vue')).toContain('กล้องยังเปิดอยู่')
  })
})

import qrcode from 'qrcode-generator'
import { createHtml5QrCodeScannerAdapter, scanBox, SCAN_FPS } from '../src/infrastructure/scanner/html5-qrcode-scanner-adapter.js'
describe('QR reading settings (owner: "กล้องไม่อ่าน qrcode")', () => {
  it('the vehicle QR uses alphanumeric mode: version 4 (33×33) instead of 5', () => {
    const qr = qrcode(0, 'M'); qr.addData('AB12'.repeat(16), 'Alphanumeric'); qr.make()
    expect(qr.getModuleCount()).toBe(33)
  })
  it('the scanner asks for the native reader, 10 fps and a square scan box', async () => {
    const calls = {}
    class Html5Qrcode {
      constructor(id, config) { calls.config = config }
      static async getCameras() { return [] }
      async start(camera, options) { calls.options = options }
      async stop() {} clear() {}
    }
    const adapter = createHtml5QrCodeScannerAdapter({ loadLibrary: async () => ({ Html5Qrcode, Html5QrcodeSupportedFormats: { QR_CODE: 0 } }), documentRef: null, secureContext: () => true })
    await adapter.start({ elementId: 'r', onDecode: () => {} })
    expect(calls.config.useBarCodeDetectorIfSupported).toBe(true)
    expect(calls.config.experimentalFeatures).toEqual({ useBarCodeDetectorIfSupported: true })
    expect(calls.options.fps).toBe(SCAN_FPS)
    expect(calls.options.qrbox).toBe(scanBox)
    expect(scanBox(400, 500)).toEqual({ width: 300, height: 300 })
    expect(scanBox(100, 100)).toEqual({ width: 100, height: 100 })
  })
})
