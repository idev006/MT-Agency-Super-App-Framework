// Proposed Phase-1 security-event policy. Pure, synthetic-only; no Sheets write or API route.
// Not a substitute for legally prescribed computer traffic data or an approved logging backend.
export const SECURITY_EVENT_TYPES = Object.freeze([
  'AUTH_LOGIN_SUCCESS','AUTH_LOGIN_FAILURE','AUTH_SESSION_REVOKED',
  'ACCESS_DENIED','QR_RESOLVE_DENIED','CONTACT_REVEAL_DENIED','SECURITY_ALERT'
]);
const DENIED_KEYS = /password|secret|token|cookie|authorization|phone|email|photo|payload|raw_ip/i;
const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;
export function validateSecurityEventDraft(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return {valid:false,errors:['INVALID_EVENT']};
  const errors=[];
  if (!SECURITY_EVENT_TYPES.includes(event.event_type)) errors.push('INVALID_EVENT_TYPE');
  if (typeof event.occurred_at!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(event.occurred_at) || !Number.isFinite(Date.parse(event.occurred_at))) errors.push('INVALID_UTC_TIMESTAMP');
  if (typeof event.correlation_id!=='string' || !ID_PATTERN.test(event.correlation_id)) errors.push('INVALID_CORRELATION_ID');
  if (!['ALLOW','DENY','ERROR'].includes(event.decision)) errors.push('INVALID_DECISION');
  if (Object.keys(event).some(key=>DENIED_KEYS.test(key))) errors.push('FORBIDDEN_SENSITIVE_FIELD');
  const allowed=new Set(['event_type','occurred_at','correlation_id','decision','actor_ref','session_ref','resource_type','resource_ref','source_context_ref','integrity_ref']);
  if (Object.keys(event).some(key=>!allowed.has(key))) errors.push('UNAPPROVED_FIELD');
  for(const k of ['actor_ref','session_ref','resource_type','resource_ref','source_context_ref','integrity_ref']) {
    if(event[k]!=null && (typeof event[k]!=='string'||!ID_PATTERN.test(event[k]))) errors.push('INVALID_'+k.toUpperCase());
  }
  return {valid:errors.length===0,errors};
}
