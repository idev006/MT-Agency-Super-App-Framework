<script setup>
import { computed } from 'vue'
import { qrImageDataUrl } from '../../../infrastructure/media/qr-image.js'
import { stickerShortCode, vehicleQrLink } from '../../../domain/qr/vehicle-qr-link.js'
import { provinceLabel } from '../../../domain/reference/provinces.js'
import { STICKER_CATEGORIES, bandTextColour } from '../../../domain/reference/sticker-categories.js'

// S5 sticker at its REAL size (owner 2026-11-26): 5 × 5 cm or 8 × 8 cm, colour by the vehicle user's
// category (StickerCategoryPolicy), the plate printed on the sticker beside the QR (never inside it).
// The QR sits on a white panel with a quiet zone (scan-safe); the colour frames it with the category text.
//   mode 'office': stickers on A4 with cut guides (print in the office, cut by hand).
//   mode 'shop'  : one sticker per page, page = sticker + 3 mm bleed on each side (send the PDF to a print shop).
// No name, phone or personal data is printed (policy).
const props = defineProps({
  items: { type: Array, required: true }, // READY export items { vehicleId, plate, province, qrId, token, stickerCategory }
  mode: { type: String, default: 'office' }, // 'office' | 'shop'
  sizeMode: { type: String, default: 'category' }, // 'category' | '5' | '8'
  unitMark: { type: String, default: 'ตำรวจภูธรภาค 6' },
})
const ORDER = Object.keys(STICKER_CATEGORIES)
const stickers = computed(() => props.items
  .filter((x) => STICKER_CATEGORIES[x.stickerCategory])
  .map((x) => {
    const cat = STICKER_CATEGORIES[x.stickerCategory]
    const size = props.sizeMode === '5' ? 5 : props.sizeMode === '8' ? 8 : cat.size
    return { ...x, cat, size, ink: bandTextColour(x.stickerCategory), provinceName: provinceLabel(x.province) || x.province,
      shortCode: stickerShortCode(x.qrId), image: qrImageDataUrl(vehicleQrLink(x.token), { cellSize: 10, margin: 2 }) }
  })
  .sort((a, b) => ORDER.indexOf(a.stickerCategory) - ORDER.indexOf(b.stickerCategory) || b.size - a.size || a.plate.localeCompare(b.plate, 'th')))
</script>

<template>
  <div class="qr-sheet" :class="`qr-sheet--${mode}`" data-qr-sheet>
    <div v-for="s in stickers" :key="s.vehicleId" class="qr-cell" :class="`qr-cell--${s.size}`">
      <article class="qr-sticker" :class="`qr-sticker--${s.size}`" :style="{ '--band': s.cat.hex, '--ink': s.ink }" :data-sticker="s.vehicleId" :data-size="s.size" :data-category="s.stickerCategory">
        <div class="qr-sticker__panel">
          <strong class="qr-sticker__plate">{{ s.plate }}</strong>
          <span class="qr-sticker__province">{{ s.provinceName }}</span>
          <img :src="s.image" :alt="`QR ยานพาหนะ ${s.plate}`" class="qr-sticker__qr" />
          <span class="qr-sticker__code">{{ s.shortCode }}</span>
        </div>
        <p class="qr-sticker__band">{{ unitMark }} · {{ s.cat.label }}</p>
      </article>
    </div>
  </div>
</template>

<style>
/* Real-world units (mm). 5 cm: frame 2.5 mm, label band 7 mm, QR 26 mm. 8 cm: frame 4 mm, band 10 mm, QR 46 mm. */
.qr-sheet { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 4mm; color: #000; }
.qr-cell { padding: 1mm; outline: 0.2mm dashed #9ca3af; } /* cut guide around each sticker (office mode) */
.qr-sticker { box-sizing: border-box; display: flex; flex-direction: column; background: var(--band); color: var(--ink); overflow: hidden; break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.qr-sticker--5 { width: 50mm; height: 50mm; padding: 2.5mm 2.5mm 0; border-radius: 2mm; }
.qr-sticker--8 { width: 80mm; height: 80mm; padding: 4mm 4mm 0; border-radius: 3mm; }
.qr-sticker__panel { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #fff; color: #000; border-radius: 1.2mm; line-height: 1.15; min-height: 0; }
.qr-sticker__plate { font-weight: 800; letter-spacing: 0.1mm; white-space: nowrap; }
.qr-sticker--5 .qr-sticker__plate { font-size: 4.6mm; }
.qr-sticker--8 .qr-sticker__plate { font-size: 8mm; }
.qr-sticker__province { white-space: nowrap; }
.qr-sticker--5 .qr-sticker__province { font-size: 2.5mm; }
.qr-sticker--8 .qr-sticker__province { font-size: 4mm; }
.qr-sticker__qr { image-rendering: pixelated; margin: 0.6mm 0; }
.qr-sticker--5 .qr-sticker__qr { width: 26mm; height: 26mm; }
.qr-sticker--8 .qr-sticker__qr { width: 46mm; height: 46mm; }
.qr-sticker__code { font-family: ui-monospace, monospace; color: #444; }
.qr-sticker--5 .qr-sticker__code { font-size: 2mm; }
.qr-sticker--8 .qr-sticker__code { font-size: 3mm; }
.qr-sticker__band { margin: 0; text-align: center; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qr-sticker--5 .qr-sticker__band { height: 7mm; line-height: 7mm; font-size: 2.4mm; }
.qr-sticker--8 .qr-sticker__band { height: 10mm; line-height: 10mm; font-size: 3.8mm; }

/* print-shop: one sticker per page; the page is the sticker + 3 mm bleed where the colour runs to the edge */
@page qr5 { size: 56mm 56mm; margin: 0; }
@page qr8 { size: 86mm 86mm; margin: 0; }
.qr-sheet--shop { gap: 6mm; }
.qr-sheet--shop .qr-cell { outline: none; padding: 3mm; background: var(--bleed, transparent); }
@media print {
  body * { visibility: hidden !important; }
  .qr-print-area, .qr-print-area * { visibility: visible !important; }
  .qr-print-area { position: absolute; inset: 0; margin: 0; padding: 0 !important; background: #fff !important; }
  .qr-sheet--office { gap: 3mm; padding: 8mm; }
  .qr-sheet--shop { display: block; padding: 0; }
  .qr-sheet--shop .qr-cell { break-after: page; padding: 3mm; outline: none; }
  .qr-sheet--shop .qr-cell--5 { page: qr5; width: 56mm; height: 56mm; }
  .qr-sheet--shop .qr-cell--8 { page: qr8; width: 86mm; height: 86mm; }
  .qr-sheet--shop .qr-sticker { border-radius: 0; box-shadow: 0 0 0 3mm var(--band); } /* bleed: colour runs past the trim line */
}
</style>
