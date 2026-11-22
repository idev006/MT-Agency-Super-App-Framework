export const qrScannerKey = Symbol('qrScanner')

export function assertQrScanner(scanner) {
  const methods = ['start', 'stop', 'scanFile']
  if (!scanner || methods.some((method) => typeof scanner[method] !== 'function')) {
    throw new TypeError('QR scanner must implement start, stop and scanFile')
  }
  return scanner
}
