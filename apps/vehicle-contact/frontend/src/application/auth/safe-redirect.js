// Back to the page that asked for sign-in (e.g. a scanned sticker #/q/<code> → QR check). Only an in-app
// path is accepted ("/app/..."), never another site.
export function safeRedirect(value) {
  const path = typeof value === 'string' ? value : ''
  return /^\/app\/[A-Za-z0-9/_\-]*(\?[A-Za-z0-9=&_\-]*)?$/.test(path) ? path : ''
}
