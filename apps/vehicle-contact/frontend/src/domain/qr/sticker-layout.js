// Sheet layout for printing stickers (owner 2026-11-26: paper sizes A-series, bleed 2–3 mm for colour to the edge,
// print shops lay many pieces on one sheet). All units are mm.
//   office : stickers on the chosen paper with dashed cut guides, no bleed (print and cut in the office)
//   sheet  : for a print shop — many stickers per sheet, each with 3 mm bleed + crop marks
//   single : for a print shop — one sticker per page, page = sticker + 3 mm bleed
export const PAPERS = Object.freeze({
  A3: Object.freeze({ w: 297, h: 420 }),
  A4: Object.freeze({ w: 210, h: 297 }),
  A5: Object.freeze({ w: 148, h: 210 }),
})
export const PRINT_MODES = Object.freeze(['office', 'sheet', 'single'])
export const PAGE_MARGIN = 8 // most printers cannot print the outer ~5 mm
export const BLEED = 3
export const MARK_ZONE = 4 // room around the bleed for the crop marks
export const OFFICE_GAP = 3

// Space one sticker takes on the sheet (centre to centre).
export function cellPitch(sizeCm, mode) {
  const trim = sizeCm * 10
  if (mode === 'sheet') return trim + 2 * (BLEED + MARK_ZONE)
  return trim + OFFICE_GAP // office: trim + gap between cut guides
}

// How many stickers of one size fit on one page of the paper.
export function sheetCapacity(paper, sizeCm, mode) {
  if (mode === 'single') return 1
  const p = PAPERS[paper]
  if (!p) return 0
  const pitch = cellPitch(sizeCm, mode)
  const gap = mode === 'office' ? OFFICE_GAP : 0
  const cols = Math.floor((p.w - 2 * PAGE_MARGIN + gap) / pitch)
  const rows = Math.floor((p.h - 2 * PAGE_MARGIN + gap) / pitch)
  return Math.max(0, cols) * Math.max(0, rows)
}

// Pages needed: each size starts on its own page (a print shop cuts each size separately).
export function pagesNeeded(paper, mode, countsBySize) {
  let pages = 0
  for (const [size, n] of Object.entries(countsBySize)) {
    if (!n) continue
    const cap = sheetCapacity(paper, Number(size), mode)
    pages += cap ? Math.ceil(n / cap) : n
  }
  return pages
}
