import { z } from 'zod';

// 페이지네이션 (API.md 5.1)
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 50;

/** 목록 쿼리 스키마에 합쳐 쓰는 page·limit 필드. 문자열 하나만 받는다 (배열·객체는 400). */
export const paginationFields = {
  page: z.coerce.number().int('정수여야 합니다.').min(1, '1 이상이어야 합니다.').optional(),
  limit: z.coerce
    .number()
    .int('정수여야 합니다.')
    .min(1, '1 이상이어야 합니다.')
    .max(MAX_LIMIT, `${MAX_LIMIT} 이하여야 합니다.`)
    .optional(),
};

export const paginationQuerySchema = z.strictObject(paginationFields);

export function buildPageMeta({ page, limit, totalItems }) {
  const totalPages = Math.ceil(totalItems / limit);
  return { page, limit, totalItems, totalPages, hasNext: page < totalPages };
}

/** 조건상 결과가 없을 때 (예: 존재하지 않는 기술 slug로 필터) DB 조회 없이 빈 페이지 */
export function emptyPage({ page = DEFAULT_PAGE, limit = DEFAULT_LIMIT } = {}) {
  return { items: [], meta: buildPageMeta({ page, limit, totalItems: 0 }) };
}

/**
 * find + countDocuments를 함께 실행한다. sort 마지막에는 _id를 넣어 순서를 안정화한다.
 * @returns {Promise<{ items: object[], meta: ReturnType<typeof buildPageMeta> }>}
 */
export async function paginate(model, { filter, sort, page = DEFAULT_PAGE, limit = DEFAULT_LIMIT, projection }) {
  const [items, totalItems] = await Promise.all([
    model
      .find(filter, projection)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    model.countDocuments(filter),
  ]);
  return { items, meta: buildPageMeta({ page, limit, totalItems }) };
}
