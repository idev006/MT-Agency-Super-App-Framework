// HTTP wrapper: same v1 JSON envelope as the GAS Web App (GET = health, POST = operation).
// Never returns internal error text.
const MAX_BODY = 8 * 1024 * 1024;

export function createApiHandler(application) {
  return (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'});
      res.end(JSON.stringify(body));
    };
    if (req.method === 'GET') return send(200, application.dispatch({apiVersion: 'v1', group: 'system', action: 'health', payload: {}}, 'GET'));
    if (req.method !== 'POST') return send(405, {ok: false, error: {code: 'METHOD_NOT_ALLOWED'}});
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) req.destroy(); else chunks.push(c); });
    req.on('end', () => {
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, {ok: false, error: {code: 'INVALID_JSON'}}); }
      try { send(200, application.dispatch(body, 'POST')); }
      catch { send(500, {ok: false, error: {code: 'OPERATION_FAILED'}}); }
    });
  };
}
