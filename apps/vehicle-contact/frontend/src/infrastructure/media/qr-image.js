import qrcode from 'qrcode-generator'

// Renders text as a QR image data URL (GIF) for posters/printing. Error level M survives light damage.
export function qrImageDataUrl(text, { cellSize = 8, margin = 4 } = {}) {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  return qr.createDataURL(cellSize, margin)
}
