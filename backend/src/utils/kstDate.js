// KST(Asia/Seoul, UTC+9, 일광절약시간 없음) 날짜 키 'YYYY-MM-DD' 계산.
// 날짜 키끼리의 계산은 UTC 자정 기준 달력 연산으로 한다 (시간대와 무관).

export const KST_TIMEZONE = 'Asia/Seoul';
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** 시각 → KST 날짜 키. 2026-10-15T14:59:59Z → '2026-10-15', 2026-10-15T15:00:00Z → '2026-10-16' */
export function toKstDateKey(date) {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** KST 날짜의 00:00 시각 (epoch ms) */
export function kstDayStartMs(dateKey) {
  return Date.parse(`${dateKey}T00:00:00.000+09:00`);
}

export function addDays(dateKey, days) {
  return new Date(Date.parse(`${dateKey}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** to - from (일). 같은 날이면 0 */
export function daysBetween(fromKey, toKey) {
  return Math.round((Date.parse(`${toKey}T00:00:00.000Z`) - Date.parse(`${fromKey}T00:00:00.000Z`)) / DAY_MS);
}

/** from부터 to까지 양 끝을 포함한 날짜 키 목록 */
export function dateKeysInRange(fromKey, toKey) {
  const keys = [];
  for (let key = fromKey; key <= toKey; key = addDays(key, 1)) keys.push(key);
  return keys;
}
