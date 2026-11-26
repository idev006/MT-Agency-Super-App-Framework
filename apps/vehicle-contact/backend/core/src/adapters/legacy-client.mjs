// Forwards an API envelope to the legacy engine (service p6vc-api) until its operation group is ported (VC-ADR-046).
// Async, so the core never blocks while the legacy answers. The answer is passed through unchanged (same envelope).
const LEGACY_URL = /^https:\/\/p6vc-api-[a-z0-9-]+\.[a-z0-9-]+\.run\.app$|^http:\/\/127\.0\.0\.1:\d{2,5}$/;

export function createLegacyClient({url = process.env.P6VC_LEGACY_API_URL, fetchImpl = fetch, timeoutMs = 55000} = {}) {
  if (!LEGACY_URL.test(String(url || ''))) throw new Error('P6VC_LEGACY_API_URL_INVALID');
  const failure = (requestId, code = 'OPERATION_FAILED') =>
    ({ok: false, data: null, error: {code, message: 'Request could not be completed'}, requestId: requestId || null});
  return {
    url,
    // method GET = health; POST = the envelope as JSON
    async dispatch(envelope, method = 'POST') {
      const requestId = envelope && typeof envelope.requestId === 'string' ? envelope.requestId : null;
      let r;
      try {
        r = await fetchImpl(url + '/', method === 'GET'
          ? {method: 'GET', signal: AbortSignal.timeout(timeoutMs)}
          : {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(envelope), signal: AbortSignal.timeout(timeoutMs)});
      } catch { return failure(requestId, 'UPSTREAM_UNAVAILABLE'); }
      let body;
      try { body = await r.json(); } catch { return failure(requestId, 'UPSTREAM_UNAVAILABLE'); }
      if (!body || typeof body.ok !== 'boolean') return failure(requestId, 'UPSTREAM_UNAVAILABLE');
      return body;
    }
  };
}
