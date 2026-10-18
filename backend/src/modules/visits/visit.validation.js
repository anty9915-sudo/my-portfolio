import { z } from 'zod';
import { ApiError } from '../../utils/ApiError.js';
import { addDays, daysBetween } from '../../utils/kstDate.js';
import { dateParam } from '../../utils/listQuery.js';

export const MAX_PATH_LENGTH = 200;
const MAX_RAW_LENGTH = 2048;
// URL 경로에 쓸 수 있는 문자 (RFC 3986 pchar + "/"). 한글 등은 브라우저가 퍼센트 인코딩해 보낸다.
const PATH_PATTERN = /^\/[A-Za-z0-9\-._~%!$&'()*+,;=:@/]*$/;

/** 쿼리스트링·해시 제거, 끝의 "/" 제거(루트 "/"는 유지). 대소문자·퍼센트 인코딩은 그대로 둔다. */
export function normalizePath(raw) {
  const withoutQuery = raw.split(/[?#]/, 1)[0];
  const trimmed = withoutQuery.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/**
 * referrer → 외부 유입 호스트명. 해석할 수 없거나 http/https가 아니거나 자기 사이트면 null (400 아님).
 * 원문은 저장하지 않는다.
 */
export function extractReferrerHost(referrer, ownHostname) {
  if (!referrer) return null;
  let url;
  try {
    url = new URL(referrer);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (!host || host === ownHostname || host.length > 253) return null;
  return host;
}

/** POST /visits (API.md 8.10) */
export const visitBodySchema = z.strictObject({
  path: z
    .string('경로 문자열이 필요합니다.')
    .max(MAX_RAW_LENGTH, `${MAX_RAW_LENGTH}자 이하여야 합니다.`)
    .transform((raw, ctx) => {
      if (!raw.startsWith('/')) {
        ctx.addIssue({ code: 'custom', message: '/로 시작해야 합니다.' });
        return z.NEVER;
      }
      const path = normalizePath(raw);
      if (path.length > MAX_PATH_LENGTH) {
        ctx.addIssue({ code: 'custom', message: `정규화한 경로가 ${MAX_PATH_LENGTH}자를 넘습니다.` });
        return z.NEVER;
      }
      if (!PATH_PATTERN.test(path)) {
        ctx.addIssue({ code: 'custom', message: 'URL 경로에 쓸 수 없는 문자가 있습니다.' });
        return z.NEVER;
      }
      return path;
    }),
  referrer: z.string('문자열이어야 합니다.').max(MAX_RAW_LENGTH, `${MAX_RAW_LENGTH}자 이하여야 합니다.`).nullable().optional(),
});

// GET /admin/stats/visits (API.md 12.1)
export const DEFAULT_TOP = 10;
export const MAX_RANGE_DAYS = 365;
const DEFAULT_RANGE_DAYS = 7;

export const visitStatsQuerySchema = z.strictObject({
  from: dateParam(),
  to: dateParam(),
  top: z.coerce.number().int('정수여야 합니다.').min(1, '1 이상이어야 합니다.').max(20, '20 이하여야 합니다.').optional(),
});

/**
 * 조회 기간 결정. 기본: 오늘 포함 최근 7일. to만 주면 from = to − 6일, from만 주면 to = 오늘.
 * to가 미래, from > to, 기간 365일 초과는 400.
 */
export function resolveStatsRange({ from, to }, today) {
  const end = to ?? today;
  const start = from ?? addDays(end, -(DEFAULT_RANGE_DAYS - 1));
  if (end > today) throw ApiError.invalidField('to', '미래 날짜는 조회할 수 없습니다.');
  if (start > end) throw ApiError.invalidField('from', 'to보다 늦을 수 없습니다.');
  if (daysBetween(start, end) + 1 > MAX_RANGE_DAYS) {
    throw ApiError.invalidField('from', `기간은 최대 ${MAX_RANGE_DAYS}일입니다.`);
  }
  return { from: start, to: end };
}
