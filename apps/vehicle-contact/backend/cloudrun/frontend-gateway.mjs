// Browser gateway on Cloud Run (VC-ADR-044 PR 2): POST /api/frontend from the web app.
// Same contract as the Cloudflare Worker's /api/frontend it replaces (same HTTP status + error codes, so
// tools/p6vc-api-test-console/verify-live-worker-failclosed.mjs checks either): allowed Origin only (CORS),
// JSON only, size limits, strict envelope, known operations only, DTO payload, bounded nested values, session shape.
// The operation list, DTO fields and public operations come from the backend itself (one source), not a copy.
import {DTO_OPERATIONS, validateOperationPayload} from '../gas/src/api/dto/OperationPayloadValidator.js';
import {PUBLIC_OPERATIONS} from '../gas/src/api/controllers/OperationController.js';

export const FRONTEND_PATH = '/api/frontend';
const ROUTER_OPERATIONS = ['system.health']; // answered by the Router, no DTO
const KNOWN = new Set([...DTO_OPERATIONS, ...ROUTER_OPERATIONS]);
const PUBLIC = new Set([...PUBLIC_OPERATIONS, ...ROUTER_OPERATIONS]);
const MEDIA = new Set(['photos.upload', 'photos.replace']);
const ENVELOPE_FIELDS = new Set(['apiVersion', 'group', 'action', 'payload', 'requestId', 'sessionToken']);
const MAX_MEDIA_BODY = 8 * 1024 * 1024, MAX_BODY = 32768, MAX_MEDIA_PAYLOAD = 7_500_000;
// arrays are small except where the API takes a list (backend QR_EXPORT_MAX 100, STICKER_CATEGORY_MAX 20)
const ARRAY_MAX = {'qr.export': 100, 'qr.markPrinted': 100, 'system.config.update': 20};
const HEX64 = /^[0-9a-f]{64}$/i;

export function allowedOrigin(origin, configured = process.env.P6VC_ALLOWED_ORIGINS) {
  if (typeof origin !== 'string' || !origin) return null;
  if (/^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(origin)) return origin; // local dev server (live UI tests)
  const list = String(configured || 'https://idev006.github.io').split(',').map(x => x.trim()).filter(Boolean);
  return list.includes(origin) ? origin : null;
}

export const corsHeaders = origin => ({
  'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type', 'access-control-max-age': '600', vary: 'Origin'
});

function safeValue(value, max, depth = 0) {
  if (depth > 3) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 4096 || depth === 0; // top-level strings are bounded by the DTO
  if (Array.isArray(value)) return value.length <= max && value.every(x => safeValue(x, max, depth + 1));
  if (typeof value === 'object') return Object.keys(value).length <= 10 && Object.entries(value).every(([k, x]) =>
    /^[A-Za-z0-9_]{1,80}$/.test(k) && !['__proto__', 'constructor', 'prototype'].includes(k) && safeValue(x, max, depth + 1));
  return false;
}

// null when the envelope may go to the application; otherwise the error code (HTTP 403)
export function invalidEnvelope(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'INVALID_BODY';
  if (Object.keys(input).some(k => !ENVELOPE_FIELDS.has(k))) return 'FIELDS_NOT_ALLOWED';
  if (input.apiVersion !== 'v1' || typeof input.group !== 'string' || typeof input.action !== 'string') return 'INVALID_ENVELOPE';
  const op = input.group + '.' + input.action;
  if (!KNOWN.has(op)) return 'OPERATION_NOT_ALLOWED';
  const p = input.payload;
  if (!p || typeof p !== 'object' || Array.isArray(p) || JSON.stringify(p).length > (MEDIA.has(op) ? MAX_MEDIA_PAYLOAD : MAX_BODY)) return 'INVALID_PAYLOAD';
  if (typeof input.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(input.requestId)) return 'INVALID_REQUEST_ID';
  if (ROUTER_OPERATIONS.includes(op)) { if (Object.keys(p).length) return 'INVALID_OPERATION_PAYLOAD'; }
  else {
    try { validateOperationPayload(op, p); } catch { return 'INVALID_OPERATION_PAYLOAD'; }
    if (!Object.values(p).every(v => safeValue(v, ARRAY_MAX[op] || 10))) return 'INVALID_OPERATION_PAYLOAD';
  }
  if (PUBLIC.has(op)) { if (input.sessionToken !== undefined) return 'INVALID_PUBLIC_PAYLOAD'; }
  else if (!HEX64.test(input.sessionToken || '')) return 'INVALID_SESSION_PAYLOAD';
  return null;
}

// (req, res, application) for requests whose path is FRONTEND_PATH
export function handleFrontend(req, res, application) {
  const origin = allowedOrigin(req.headers.origin);
  const send = (status, body, extra = {}) => {
    res.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
      'x-content-type-options': 'nosniff', ...(origin ? corsHeaders(origin) : {}), ...extra});
    res.end(body === null ? '' : JSON.stringify(body));
  };
  if (!origin) return send(403, {error: 'ORIGIN_NOT_ALLOWED'});
  if (req.method === 'OPTIONS') return send(204, null);
  if (req.method !== 'POST') return send(405, {error: 'METHOD_NOT_ALLOWED'});
  if (String(req.headers['content-type'] || '').split(';')[0].trim() !== 'application/json') return send(415, {error: 'JSON_REQUIRED'});
  let size = 0, tooLarge = false; const chunks = [];
  req.on('data', c => { size += c.length; if (size > MAX_MEDIA_BODY) { tooLarge = true; chunks.length = 0; } else if (!tooLarge) chunks.push(c); });
  req.on('end', () => {
    if (tooLarge) return send(413, {error: 'REQUEST_TOO_LARGE'});
    const raw = Buffer.concat(chunks).toString('utf8');
    let input;
    try { input = JSON.parse(raw); } catch { return send(400, {error: 'INVALID_JSON'}); }
    const op = input && typeof input === 'object' ? input.group + '.' + input.action : '';
    if (!MEDIA.has(op) && raw.length > MAX_BODY) return send(413, {error: 'REQUEST_TOO_LARGE'});
    const invalid = invalidEnvelope(input);
    if (invalid) return send(403, {error: invalid});
    try { send(200, application.dispatch(input, 'POST')); }
    catch { send(500, {ok: false, error: {code: 'OPERATION_FAILED'}}); }
  });
}
