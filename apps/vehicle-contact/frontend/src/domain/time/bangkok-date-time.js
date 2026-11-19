const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
const BANGKOK_OFFSET_HOURS = 7

export function bangkokLocalToIso(value) {
  const match = LOCAL_PATTERN.exec(String(value || ''))
  if (!match) throw new RangeError('INVALID_DATE_TIME')
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0'] = match
  const parts = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number)
  const [year, month, day, hour, minute, second] = parts
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day
    || calendar.getUTCHours() !== hour || calendar.getUTCMinutes() !== minute || calendar.getUTCSeconds() !== second) {
    throw new RangeError('INVALID_DATE_TIME')
  }
  return new Date(Date.UTC(year, month - 1, day, hour - BANGKOK_OFFSET_HOURS, minute, second)).toISOString()
}

export function formatBangkokDateTime(value, fallback = 'ไม่ทราบเวลา') {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return fallback
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(date)
}

export function bangkokNowInput(now = Date.now()) {
  return new Date(now + BANGKOK_OFFSET_HOURS * 60 * 60 * 1000).toISOString().slice(0, 16)
}
