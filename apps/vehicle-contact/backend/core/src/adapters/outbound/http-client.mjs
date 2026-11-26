// The ONLY place in the Node core that calls fetch() (VC-ADR-047, NODE_CORE_ARCHITECTURE §5 rule 1).
// Per integration: timeout, retry for idempotent calls only (backoff + jitter), circuit breaker, requestId passed on,
// structured log with name / status / ms / attempt — never bodies, headers or secrets.
// Failures become one of our codes: UPSTREAM_TIMEOUT | UPSTREAM_UNAVAILABLE | UPSTREAM_REJECTED (4xx).
export class UpstreamError extends Error {
  constructor(code, integration, status = null) { super(code); this.code = code; this.integration = integration; this.status = status; }
}

export function createCircuitBreaker({failures = 5, openMs = 15000, now = () => Date.now()} = {}) {
  let consecutive = 0, openUntil = 0;
  return {
    allow: () => now() >= openUntil, // half-open after openMs: one call may try again
    success() { consecutive = 0; openUntil = 0; },
    failure() { consecutive++; if (consecutive >= failures) openUntil = now() + openMs; },
    state: () => (now() < openUntil ? 'open' : consecutive ? 'degraded' : 'closed')
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export function createHttpClient({name, url, timeoutMs = 20000, retry = {max: 0}, breaker = {}, fetchImpl = fetch,
  log = entry => console.log(JSON.stringify(entry)), now = () => Date.now()}) {
  if (!name || typeof url !== 'string' || !url) throw new Error('HTTP_CLIENT_CONFIG');
  const circuit = createCircuitBreaker({...breaker, now});
  const maxRetries = Math.max(0, Math.min(5, Number(retry.max) || 0)), backoffMs = Number(retry.backoffMs) || 200;

  // request: {method, path = '', headers = {}, body (string), idempotent = false, requestId}
  async function request({method = 'GET', path = '', headers = {}, body, idempotent = false, requestId = null}) {
    if (!circuit.allow()) { log({event: 'outbound', name, outcome: 'circuit_open'}); throw new UpstreamError('UPSTREAM_UNAVAILABLE', name); }
    const attempts = 1 + (idempotent ? maxRetries : 0);
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const t0 = now();
      try {
        const r = await fetchImpl(url + path, {method, body, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs),
          headers: {...headers, ...(requestId ? {'x-request-id': requestId} : {})}});
        const text = await r.text();
        log({event: 'outbound', name, status: r.status, ms: now() - t0, attempt});
        if (r.status >= 500) throw new UpstreamError('UPSTREAM_UNAVAILABLE', name, r.status);
        circuit.success(); // reached and answered (2xx–4xx): the upstream is up
        if (r.status >= 400) throw new UpstreamError('UPSTREAM_REJECTED', name, r.status);
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { throw new UpstreamError('UPSTREAM_UNAVAILABLE', name, r.status); }
        return {status: r.status, json};
      } catch (e) {
        if (e instanceof UpstreamError && e.code === 'UPSTREAM_REJECTED') throw e; // our request was refused: no retry
        lastError = e?.name === 'TimeoutError' ? new UpstreamError('UPSTREAM_TIMEOUT', name)
          : e instanceof UpstreamError ? e : new UpstreamError('UPSTREAM_UNAVAILABLE', name);
        if (!(e instanceof UpstreamError)) log({event: 'outbound', name, outcome: lastError.code, ms: now() - t0, attempt});
        if (attempt < attempts) await sleep(backoffMs * 2 ** (attempt - 1) * (0.5 + Math.random() / 2));
      }
    }
    circuit.failure();
    throw lastError;
  }
  return Object.freeze({name, request, state: () => circuit.state()});
}
