// Gateway: the legacy engine (port LegacyEngine). Its answer is our own envelope, passed through unchanged; any transport
// failure becomes a clean envelope with the request's id (VC-ADR-046 phase 1 behaviour, now on the shared http-client).
export function createLegacyEngineGateway({http}) {
  const failure = (requestId, code) => ({ok: false, data: null, error: {code, message: 'Request could not be completed'}, requestId: requestId || null});
  return Object.freeze({
    async dispatch(envelope, method = 'POST') {
      const requestId = envelope && typeof envelope.requestId === 'string' ? envelope.requestId : null;
      try {
        const {json} = method === 'GET'
          ? await http.request({method: 'GET', path: '/', idempotent: true})
          : await http.request({method: 'POST', path: '/', headers: {'content-type': 'application/json'}, body: JSON.stringify(envelope), requestId});
        if (!json || typeof json.ok !== 'boolean') return failure(requestId, 'UPSTREAM_UNAVAILABLE');
        return json;
      } catch (e) { return failure(requestId, e?.code === 'UPSTREAM_TIMEOUT' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE'); }
    }
  });
}
