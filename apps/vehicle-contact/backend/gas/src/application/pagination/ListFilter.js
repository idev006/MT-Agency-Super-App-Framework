// D2 (owner audit: admin lists were cluttered and unfilterable): optional server-side list filters, applied
// BEFORE pagination so totals and pages are correct. Unknown values fail closed (INVALID_* -> INVALID_REQUEST).
export function listFilter(p, {status = [], extra = {}} = {}) {
  const pick = (name, allowed) => {
    if (p[name] === undefined || p[name] === '') return '';
    const v = String(p[name]);
    if (!allowed.includes(v)) throw new Error('INVALID_FILTER');
    return v;
  };
  const statusValue = pick('status', status);
  const extras = Object.fromEntries(Object.entries(extra).map(([k, allowed]) => [k, pick(k, allowed)]));
  const q = p.q === undefined ? '' : String(p.q).trim().toLowerCase();
  if (q.length > 100) throw new Error('INVALID_FILTER');
  return {
    status: statusValue, ...extras, q,
    text: (...values) => !q || values.some(v => String(v || '').toLowerCase().includes(q)),
  };
}
