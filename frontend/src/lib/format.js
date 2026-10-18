// 날짜는 KST 기준으로 표시한다 (백엔드: 날짜만 입력한 값은 UTC 자정 = KST 09:00).
const KST = 'Asia/Seoul'

function parts(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  return Object.fromEntries(formatted.map(({ type, value: part }) => [type, part]))
}

/** 2026.09.28 */
export function formatDate(value) {
  const p = parts(value)
  return p ? `${p.year}.${p.month}.${p.day}` : ''
}

/** 2026.05 */
export function formatMonth(value) {
  const p = parts(value)
  return p ? `${p.year}.${p.month}` : ''
}

/** 09.28 */
export function formatShortDate(value) {
  const p = parts(value)
  return p ? `${p.month}.${p.day}` : ''
}

/** 2026.10.02 14:22 */
export function formatDateTime(value) {
  const p = parts(value)
  return p ? `${p.year}.${p.month}.${p.day} ${p.hour}:${p.minute}` : ''
}

/** <input type="date">에 넣을 YYYY-MM-DD (KST) */
export function toDateInput(value) {
  const p = parts(value)
  return p ? `${p.year}-${p.month}-${p.day}` : ''
}

/** 오늘(KST)에서 days일을 더한 YYYY-MM-DD */
export function kstDateKey(offsetDays = 0) {
  const p = parts(new Date(Date.now() + offsetDays * 86_400_000))
  return `${p.year}-${p.month}-${p.day}`
}

export function formatNumber(value, lang = 'ko') {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'ko-KR').format(value)
}

export function pad2(value) {
  return String(value).padStart(2, '0')
}
