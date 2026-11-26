<script setup>
import { computed } from 'vue'
import { qrImageDataUrl } from '../../../infrastructure/media/qr-image.js'
import { stickerShortCode, vehicleQrLink } from '../../../domain/qr/vehicle-qr-link.js'
import { provinceLabel } from '../../../domain/reference/provinces.js'
import { stickerOf } from '../../../domain/reference/sticker-categories.js'
import { PAPERS } from '../../../domain/qr/sticker-layout.js'

// S5 sticker at its REAL size: 5 × 5 cm or 8 × 8 cm, colour by the vehicle user's category (StickerCategoryPolicy).
// Owner 2026-11-26: the WHOLE sticker is the colour so a guard sees it from far away. Only a white tile sits
// behind the QR (a QR needs a light quiet zone to scan); the plate is printed large on the colour.
//   mode 'office': on the chosen paper with dashed cut guides (print and cut in the office)
//   mode 'sheet' : print shop — many per sheet, each with 3 mm bleed + crop marks
//   mode 'single': print shop — one per page, page = sticker + 3 mm bleed
// Each size starts on its own page. No name, phone or personal data is printed.
const props = defineProps({
  items: { type: Array, required: true }, // READY export items { vehicleId, plate, province, qrId, token, sticker | stickerCategory }
  mode: { type: String, default: 'office' }, // 'office' | 'sheet' | 'single'
  sizeMode: { type: String, default: 'category' }, // 'category' | '5' | '8'
  paper: { type: String, default: 'A4' }, // A3 | A4 | A5 (office / sheet)
  unitMark: { type: String, default: 'ตำรวจภูธรภาค 6' },
})
const paperName = computed(() => (PAPERS[props.paper] ? props.paper : 'A4'))
const stickers = computed(() => props.items
  .map((x) => ({ x, cat: x.sticker || stickerOf(x.stickerCategory) })) // VC-ADR-038: the configured colour/size from the server
  .filter(({ cat }) => cat)
  .map(({ x, cat }) => {
    const size = props.sizeMode === '5' ? 5 : props.sizeMode === '8' ? 8 : cat.size
    return { ...x, cat, size, ink: cat.ink, provinceName: provinceLabel(x.province) || x.province,
      shortCode: stickerShortCode(x.qrId), image: qrImageDataUrl(vehicleQrLink(x.token), { cellSize: 10, margin: 2 }) }
  })
  .sort((a, b) => b.size - a.size || a.cat.label.localeCompare(b.cat.label, 'th') || a.plate.localeCompare(b.plate, 'th')))
const groups = computed(() => [8, 5].map((size) => ({ size, list: stickers.value.filter((s) => s.size === size) })).filter((g) => g.list.length))
// crop marks (mm) around one cell in 'sheet' mode: cell = mark zone 4 + bleed 3 + trim + bleed 3 + mark zone 4
const marks = (size) => {
  const w = size * 10 + 14, o = 7, l = 3.5
  return { w, lines: [[0, o, l, o], [w - l, o, w, o], [0, w - o, l, w - o], [w - l, w - o, w, w - o],
    [o, 0, o, l], [w - o, 0, w - o, l], [o, w - l, o, w], [w - o, w - l, w - o, w]] }
}
</script>

<template>
  <div class="qr-sheet" :class="[`qr-sheet--${mode}`, `qr-sheet--paper-${paperName}`]" :data-paper="paperName" data-qr-sheet>
    <div v-for="g in groups" :key="g.size" class="qr-group" :class="`qr-group--${g.size}`" :data-group-size="g.size">
      <div v-for="s in g.list" :key="s.vehicleId" class="qr-cell" :class="`qr-cell--${s.size}`" :style="{ '--band': s.cat.hex }">
        <svg v-if="mode === 'sheet'" class="qr-marks" :viewBox="`0 0 ${marks(s.size).w} ${marks(s.size).w}`" aria-hidden="true">
          <line v-for="(m, i) in marks(s.size).lines" :key="i" :x1="m[0]" :y1="m[1]" :x2="m[2]" :y2="m[3]" stroke="#000" stroke-width="0.15" />
        </svg>
        <div class="qr-bleed">
          <article class="qr-sticker" :class="`qr-sticker--${s.size}`" :style="{ '--band': s.cat.hex, '--ink': s.ink }" :data-sticker="s.vehicleId" :data-size="s.size" :data-category="s.cat.code">
            <div class="qr-sticker__head">
              <strong class="qr-sticker__plate">{{ s.plate }}</strong>
              <span class="qr-sticker__province">{{ s.provinceName }}</span>
            </div>
            <div class="qr-sticker__tile">
              <img :src="s.image" :alt="`QR ยานพาหนะ ${s.plate}`" class="qr-sticker__qr" />
              <span class="qr-sticker__code">{{ s.shortCode }}</span>
            </div>
            <p class="qr-sticker__foot">{{ unitMark }} · {{ s.cat.label }}</p>
          </article>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* Real-world units (mm). Whole sticker = category colour; white tile only behind the QR.
   5 cm: padding 2.2, plate 5.6, QR 26 on a 28 mm tile. 8 cm: padding 3.5, plate 9.5, QR 44 on a 47 mm tile. */
.qr-sheet { color: #000; }
.qr-group { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 3mm; }
.qr-group + .qr-group { margin-top: 6mm; }
.qr-cell { position: relative; flex: none; }
.qr-sticker { box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: space-between; text-align: center; background: var(--band); color: var(--ink); overflow: hidden; break-inside: avoid; line-height: 1.1; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.qr-sticker--5 { width: 50mm; height: 50mm; padding: 2.2mm; }
.qr-sticker--8 { width: 80mm; height: 80mm; padding: 3.5mm; }
.qr-sticker__head { display: flex; flex-direction: column; align-items: center; min-width: 0; max-width: 100%; }
.qr-sticker__plate { font-weight: 800; letter-spacing: 0.1mm; white-space: nowrap; }
.qr-sticker--5 .qr-sticker__plate { font-size: 5.6mm; }
.qr-sticker--8 .qr-sticker__plate { font-size: 9.5mm; }
.qr-sticker__province { font-weight: 600; white-space: nowrap; }
.qr-sticker--5 .qr-sticker__province { font-size: 2.6mm; }
.qr-sticker--8 .qr-sticker__province { font-size: 4.2mm; }
.qr-sticker__tile { display: flex; flex-direction: column; align-items: center; background: #fff; color: #333; }
.qr-sticker--5 .qr-sticker__tile { padding: 1mm 1mm 0.4mm; border-radius: 1mm; }
.qr-sticker--8 .qr-sticker__tile { padding: 1.5mm 1.5mm 0.5mm; border-radius: 1.5mm; }
.qr-sticker__qr { display: block; image-rendering: pixelated; }
.qr-sticker--5 .qr-sticker__qr { width: 26mm; height: 26mm; }
.qr-sticker--8 .qr-sticker__qr { width: 44mm; height: 44mm; }
.qr-sticker__code { font-family: ui-monospace, monospace; }
.qr-sticker--5 .qr-sticker__code { font-size: 2mm; }
.qr-sticker--8 .qr-sticker__code { font-size: 3mm; }
.qr-sticker__foot { margin: 0; max-width: 100%; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qr-sticker--5 .qr-sticker__foot { font-size: 2.4mm; }
.qr-sticker--8 .qr-sticker__foot { font-size: 4mm; }

/* office: dashed cut guide on the trim line, colour runs to the guide */
.qr-sheet--office .qr-cell { outline: 0.2mm dashed #6b7280; }
/* print shop: bleed = the colour runs 3 mm past the trim line */
.qr-sheet--sheet .qr-bleed, .qr-sheet--single .qr-bleed { padding: 3mm; background: var(--band); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.qr-sheet--sheet .qr-group { gap: 0; }
.qr-sheet--sheet .qr-cell { padding: 4mm; }
.qr-marks { position: absolute; inset: 0; width: 100%; height: 100%; }
.qr-sheet--single .qr-group { gap: 6mm; }

/* The print copy is teleported to <body> (.qr-print-root); printing shows only that copy. */
.qr-print-root { display: none; }
@page sheetA3 { size: A3; margin: 8mm; }
@page sheetA4 { size: A4; margin: 8mm; }
@page sheetA5 { size: A5; margin: 8mm; }
@page qr5 { size: 56mm 56mm; margin: 0; }
@page qr8 { size: 86mm 86mm; margin: 0; }
@media print {
  body:has(> .qr-print-root) > *:not(.qr-print-root) { display: none !important; }
  .qr-print-root { display: block; background: #fff; }
  .qr-group + .qr-group { margin-top: 0; break-before: page; }
  .qr-sheet--paper-A3 .qr-group { page: sheetA3; }
  .qr-sheet--paper-A4 .qr-group { page: sheetA4; }
  .qr-sheet--paper-A5 .qr-group { page: sheetA5; }
  .qr-sheet--single .qr-group { display: block; }
  .qr-sheet--single .qr-cell { break-after: page; }
  .qr-sheet--single .qr-cell:last-child { break-after: auto; }
  .qr-sheet--single .qr-group--5 { page: qr5; }
  .qr-sheet--single .qr-group--8 { page: qr8; }
}
</style>
