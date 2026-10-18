import mongoose from 'mongoose';
import { z } from 'zod';
import { parseDateInput, SLUG_PATTERN, TAG_PATTERN } from './fields.js';
import { paginationFields } from './pagination.js';

// 목록 조회 공통 규칙 (API.md 5장): 검색 q, 단일 값 필터, sort 허용 목록, 날짜 범위(KST).
// 모든 쿼리 파라미터는 문자열 하나만 받는다. 중복 파라미터(배열)·객체형(a[$ne]=x → 알 수 없는 키)은 400.

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 50;
export const MAX_SORT_FIELDS = 2;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const KST_OFFSET = '+09:00';
const DAY_MS = 24 * 60 * 60 * 1000;
const SINGLE = '값은 하나만 보낼 수 있습니다.';

/** 정규식 특수문자를 이스케이프해 검색어를 글자 그대로 비교한다 (ReDoS·쿼리 조작 방지) */
export function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 쿼리 파라미터 필드 (모두 선택)

export const searchParam = () =>
  z
    .string(SINGLE)
    .trim()
    .min(SEARCH_MIN_LENGTH, `${SEARCH_MIN_LENGTH}자 이상이어야 합니다.`)
    .max(SEARCH_MAX_LENGTH, `${SEARCH_MAX_LENGTH}자 이하여야 합니다.`)
    .optional();

export const slugParam = (maxLength) =>
  z
    .string(SINGLE)
    .max(maxLength, `${maxLength}자 이하여야 합니다.`)
    .regex(SLUG_PATTERN, '올바른 slug 형식이 아닙니다.')
    .optional();

export const tagParam = () =>
  z
    .string(SINGLE)
    .trim()
    .toLowerCase()
    .min(1, '빈 값은 사용할 수 없습니다.')
    .max(30, '30자 이하여야 합니다.')
    .regex(TAG_PATTERN, '올바른 태그 형식이 아닙니다.')
    .optional();

/** 불리언 필터: 'true' / 'false' 문자열만 (API.md 5.4) */
export const booleanParam = () =>
  z
    .enum(['true', 'false'], 'true 또는 false여야 합니다.')
    .transform((value) => value === 'true')
    .optional();

export const enumParam = (values) => z.enum(values).optional();

/** YYYY-MM-DD (KST 날짜). 범위 변환은 dateRangeFilter에서 한다. */
export const dateParam = () =>
  z
    .string(SINGLE)
    .refine(
      (value) => DATE_ONLY_PATTERN.test(value) && parseDateInput(value) !== null,
      'YYYY-MM-DD 형식의 올바른 날짜여야 합니다.',
    )
    .optional();

/**
 * sort=-startedAt,title → [{ field: 'startedAt', direction: -1 }, { field: 'title', direction: 1 }]
 * 허용 목록 밖의 필드, 3개 이상, 같은 필드 반복, 빈 항목은 400 (API.md 5.2).
 */
export function sortParam(allowedFields) {
  const allowed = new Set(allowedFields);
  return z
    .string(SINGLE)
    .transform((value, ctx) => {
      const parts = value.split(',');
      const fail = (message) => {
        ctx.addIssue({ code: 'custom', message });
        return z.NEVER;
      };
      if (parts.length > MAX_SORT_FIELDS) return fail(`정렬 기준은 최대 ${MAX_SORT_FIELDS}개입니다.`);
      const spec = [];
      for (const part of parts) {
        const descending = part.startsWith('-');
        const field = descending ? part.slice(1) : part;
        if (!allowed.has(field)) {
          return fail(`정렬할 수 없는 필드입니다. 허용: ${[...allowed].join(', ')}`);
        }
        if (spec.some((entry) => entry.field === field)) return fail('같은 필드를 두 번 정렬할 수 없습니다.');
        spec.push({ field, direction: descending ? -1 : 1 });
      }
      return spec;
    })
    .optional();
}

/**
 * 목록 쿼리 스키마. 정의되지 않은 파라미터는 400 (strictObject).
 * @param {Record<string, import('zod').ZodType>} filters 리소스별 필터·검색 필드
 * @param {{ sortFields?: string[], paginated?: boolean, dateRange?: boolean }} options
 */
export function listQuerySchema(filters, { sortFields, paginated = true, dateRange = false } = {}) {
  const shape = { ...filters };
  if (paginated) Object.assign(shape, paginationFields);
  if (sortFields) shape.sort = sortParam(sortFields);
  const schema = z.strictObject(shape);
  if (!dateRange) return schema;
  return schema.refine((query) => !query.from || !query.to || query.from <= query.to, {
    path: ['to'],
    message: 'from보다 이른 날짜일 수 없습니다.',
  });
}

/**
 * sort가 없으면 리소스의 기본 정렬(현재 방향 유지)을 쓴다.
 * sort가 있으면 _id를 마지막에 추가하고, 방향은 마지막으로 지정한 필드를 따른다.
 */
export function buildSort(sortSpec, defaultSort) {
  if (!sortSpec || sortSpec.length === 0) return defaultSort;
  const sort = {};
  for (const { field, direction } of sortSpec) sort[field] = direction;
  sort._id = sortSpec[sortSpec.length - 1].direction;
  return sort;
}

/** 대소문자 무시 부분 일치. 서버가 만든 연산자이므로 mongoose.trusted로 감싼다 (sanitizeFilter). */
export function searchFilter(q, fields) {
  if (!q) return {};
  const pattern = mongoose.trusted({ $regex: escapeRegex(q), $options: 'i' });
  return { $or: fields.map((field) => ({ [field]: pattern })) };
}

/** KST 날짜의 시작 시각 (UTC Date). 2026-09-01 → 2026-08-31T15:00:00.000Z */
export function kstDayStart(date) {
  return new Date(`${date}T00:00:00.000${KST_OFFSET}`);
}

/**
 * from: 해당 KST 날짜 00:00 이상, to: 해당 KST 날짜 전체 포함 (다음 날 00:00 미만).
 * 'YYYY-MM-DD'로 저장한 날짜(UTC 자정 = KST 09:00)도 같은 KST 날짜에 속한다.
 */
export function dateRangeFilter(from, to) {
  const range = {};
  if (from) range.$gte = kstDayStart(from);
  if (to) range.$lt = new Date(kstDayStart(to).getTime() + DAY_MS);
  return Object.keys(range).length > 0 ? mongoose.trusted(range) : undefined;
}
