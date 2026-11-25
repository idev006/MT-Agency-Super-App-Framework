<script setup>
import { computed } from 'vue'
import { qrImageDataUrl } from '../../../infrastructure/media/qr-image.js'
import { stickerShortCode, vehicleQrLink } from '../../../domain/qr/vehicle-qr-link.js'
import { provinceLabel } from '../../../domain/reference/provinces.js'

// S5 / VC-ADR-032 sticker: QR (link to this app) + plate + province + unit mark + short code. The plate
// is printed BESIDE the QR, never inside it. Layouts: A4 office label sheet (3 × 8) or one sticker per
// page for a print shop. Printed with the browser (Print / Save as PDF); @page sets the paper.
const props = defineProps({
  items: { type: Array, required: true }, // READY export items { vehicleId, plate, province, qrId, token }
  layout: { type: String, default: 'a4' }, // 'a4' | 'single'
  unitMark: { type: String, default: 'ตำรวจภูธรภาค 6' },
})
const stickers = computed(() => props.items.map((x) => ({ ...x, image: qrImageDataUrl(vehicleQrLink(x.token), { cellSize: 10, margin: 2 }),
  provinceName: provinceLabel(x.province) || x.province, shortCode: stickerShortCode(x.qrId) })))
</script>

<template>
  <div class="qr-sheet" :class="`qr-sheet--${layout}`" data-qr-sheet>
    <article v-for="s in stickers" :key="s.vehicleId" class="qr-sticker" :data-sticker="s.vehicleId">
      <img :src="s.image" :alt="`QR ยานพาหนะ ${s.plate}`" class="qr-sticker__qr" />
      <div class="qr-sticker__text">
        <strong class="qr-sticker__plate">{{ s.plate }}</strong>
        <span class="qr-sticker__province">{{ s.provinceName }}</span>
        <span class="qr-sticker__unit">{{ unitMark }}</span>
        <span class="qr-sticker__code">{{ s.shortCode }}</span>
      </div>
    </article>
  </div>
</template>

<style>
.qr-sheet { display: grid; gap: 4mm; color: #000; }
.qr-sheet--a4 { grid-template-columns: repeat(3, 1fr); }
.qr-sheet--single { grid-template-columns: 1fr; justify-items: center; }
.qr-sticker { display: flex; align-items: center; gap: 3mm; padding: 3mm; border: 0.3mm dashed #999; border-radius: 2mm; background: #fff; break-inside: avoid; }
.qr-sheet--single .qr-sticker { flex-direction: column; width: 70mm; padding: 5mm; border-style: solid; }
.qr-sticker__qr { width: 26mm; height: 26mm; image-rendering: pixelated; flex: none; }
.qr-sheet--single .qr-sticker__qr { width: 55mm; height: 55mm; }
.qr-sticker__text { display: grid; gap: 0.5mm; min-width: 0; line-height: 1.2; }
.qr-sheet--single .qr-sticker__text { justify-items: center; text-align: center; }
.qr-sticker__plate { font-size: 5mm; font-weight: 700; letter-spacing: 0.2mm; }
.qr-sheet--single .qr-sticker__plate { font-size: 8mm; }
.qr-sticker__province { font-size: 3.2mm; }
.qr-sticker__unit { font-size: 2.6mm; }
.qr-sticker__code { font-family: ui-monospace, monospace; font-size: 2.4mm; color: #444; }
@media print {
  body * { visibility: hidden !important; }
  .qr-print-area, .qr-print-area * { visibility: visible !important; }
  .qr-print-area { position: absolute; inset: 0; margin: 0; padding: 0; }
  .qr-sheet--a4 { gap: 0; grid-auto-rows: 37mm; }
  .qr-sheet--a4 .qr-sticker { border-color: #ddd; }
  .qr-sheet--single .qr-sticker { break-after: page; margin: 20mm auto 0; }
}
</style>
