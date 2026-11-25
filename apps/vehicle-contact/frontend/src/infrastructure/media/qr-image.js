import qrcode from 'qrcode-generator'

// Renders text as a QR image data URL (GIF) for posters/printing. Error level M survives light damage.
// mode 'Alphanumeric' (0-9, A-Z, a few symbols) packs a 64-char hex code into version 4 instead of 5:
// bigger modules at the same size, easier for a phone camera to read.
export function qrImageDataUrl(text, { cellSize = 8, margin = 4, mode } = {}) {
  const qr = qrcode(0, 'M')
  if (mode) qr.addData(text, mode)
  else qr.addData(text)
  qr.make()
  return qr.createDataURL(cellSize, margin)
}
