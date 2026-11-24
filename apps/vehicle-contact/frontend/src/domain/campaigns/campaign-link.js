// VC-ADR-031 (owner 2026-11-25): the campaign code is not a secret; admins copy/share it at any time.
// The shareable thing is a LINK, so the registrant never types 64 characters. The code travels in
// the hash fragment (#/register?c=...), which browsers never send in Referer headers or server logs.
export const CAMPAIGN_CODE_PATTERN = /^[0-9a-f]{64}$/i

export function isCampaignCode(value) {
  return typeof value === 'string' && CAMPAIGN_CODE_PATTERN.test(value)
}

export function campaignRegistrationLink(code, location = globalThis.location) {
  if (!isCampaignCode(code)) return ''
  const base = location ? `${location.origin}${location.pathname}` : ''
  return `${base}#/register?c=${code.toLowerCase()}`
}

export function campaignDisplayName(item) {
  return item?.name?.trim() || 'แคมเปญไม่มีชื่อ'
}
