import { z } from 'zod';

// 공통 필드 검증 규칙 (DATABASE.md 3장). 오류 메시지에 입력값을 담지 않는다.

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;
export const TAG_PATTERN = /^[a-z0-9가-힣]+(?:-[a-z0-9가-힣]+)*$/;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const VISIBILITIES = ['public', 'private'];

export const emptyToNull = (value) => (typeof value === 'string' && value.trim() === '' ? null : value);
const unique = (values) => [...new Set(values)];

export function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname !== '';
  } catch {
    return false;
  }
}

/** 'YYYY-MM-DD'(UTC 자정) 또는 시간대가 있는 ISO-8601 날짜시각. 2026-02-30 같은 값은 거부한다. */
export function parseDateInput(value) {
  if (typeof value !== 'string') return null;
  if (DATE_ONLY_PATTERN.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
  }
  if (DATE_TIME_PATTERN.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/** 오늘(KST) 이후의 날짜가 아니면 true. 'YYYY-MM-DD'로 입력한 오늘 날짜는 허용한다. */
export function isNotFutureDate(date, now = Date.now()) {
  const kstToday = new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10);
  return date.getTime() <= now || date.toISOString().slice(0, 10) <= kstToday;
}

export const requiredText = (max, min = 1) =>
  z.string().trim().min(min, `${min}자 이상이어야 합니다.`).max(max, `${max}자 이하여야 합니다.`);

/** 선택 텍스트: 빈 문자열·null → null(값 삭제), 생략 → 변경 없음 */
export const optionalText = (max) =>
  z.preprocess(emptyToNull, z.string().trim().max(max, `${max}자 이하여야 합니다.`).nullable()).optional();

export const slugField = (min, max) =>
  z
    .string()
    .trim()
    .min(min, `${min}자 이상이어야 합니다.`)
    .max(max, `${max}자 이하여야 합니다.`)
    .regex(SLUG_PATTERN, '소문자·숫자·하이픈만 사용할 수 있습니다.');

export const optionalHttpsUrl = () =>
  z
    .preprocess(
      emptyToNull,
      z.string().trim().max(2048, '2048자 이하여야 합니다.').refine(isHttpsUrl, 'https URL만 허용됩니다.').nullable(),
    )
    .optional();

/** 필수 이메일: 앞뒤 공백 제거 + 소문자 */
export const requiredEmail = () =>
  z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
    z.email('이메일 형식이 올바르지 않습니다.').max(254, '254자 이하여야 합니다.'),
  );

/** 선택 이메일: 앞뒤 공백 제거 + 소문자, 빈 문자열·null → null, 생략 → 변경 없음 */
export const optionalEmail = () =>
  z
    .preprocess(
      (value) => {
        if (typeof value !== 'string') return value;
        const trimmed = value.trim();
        return trimmed === '' ? null : trimmed.toLowerCase();
      },
      z.email('이메일 형식이 올바르지 않습니다.').max(254, '254자 이하여야 합니다.').nullable(),
    )
    .optional();

export const tagsField = () =>
  z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .min(1, '빈 태그는 사용할 수 없습니다.')
        .max(30, '30자 이하여야 합니다.')
        .regex(TAG_PATTERN, '소문자·숫자·한글·하이픈만 사용할 수 있습니다.'),
    )
    .max(10, '최대 10개까지 입력할 수 있습니다.')
    .transform(unique)
    .optional();

export const objectIdString = () =>
  z
    .string()
    .regex(OBJECT_ID_PATTERN, '올바른 ID 형식이 아닙니다.')
    .transform((value) => value.toLowerCase());

export const objectIdArray = (max) =>
  z.array(objectIdString()).max(max, `최대 ${max}개까지 입력할 수 있습니다.`).transform(unique).optional();

export const dateField = () =>
  z
    .string('날짜 문자열이어야 합니다.')
    .transform((value, ctx) => {
      const date = parseDateInput(value);
      if (!date) {
        ctx.addIssue({ code: 'custom', message: 'YYYY-MM-DD 또는 ISO-8601 형식이어야 합니다.' });
        return z.NEVER;
      }
      return date;
    });

export const sortOrderField = () =>
  z.number().int('정수여야 합니다.').min(0, '0 이상이어야 합니다.').max(9999, '9999 이하여야 합니다.').optional();

export const visibilityField = () => z.enum(VISIBILITIES).optional();

/** PATCH 본문: 모든 필드 선택, 최소 1개 필요 */
export function toPatchSchema(createShape) {
  return z
    .strictObject(createShape)
    .partial()
    .refine((body) => Object.keys(body).length > 0, { message: '수정할 필드를 하나 이상 보내야 합니다.' });
}
