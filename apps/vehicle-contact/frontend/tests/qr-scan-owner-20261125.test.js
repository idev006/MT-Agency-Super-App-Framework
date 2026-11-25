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
