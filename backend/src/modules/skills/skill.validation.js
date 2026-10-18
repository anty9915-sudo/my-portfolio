import { z } from 'zod';
import {
  emptyToNull,
  optionalText,
  requiredText,
  slugField,
  sortOrderField,
  toPatchSchema,
  VISIBILITIES,
  visibilityField,
} from '../../utils/fields.js';
import { enumParam, listQuerySchema, searchParam } from '../../utils/listQuery.js';
import { SKILL_CATEGORIES, SKILL_STATUSES } from './skill.model.js';

const skillShape = {
  name: requiredText(50),
  slug: slugField(1, 50), // 기술만 1자 허용 (c, go, r)
  category: z.enum(SKILL_CATEGORIES),
  status: z.enum(SKILL_STATUSES),
  description: optionalText(300),
  iconKey: z
    .preprocess(
      emptyToNull,
      z
        .string()
        .trim()
        .max(50, '50자 이하여야 합니다.')
        .regex(/^[a-z0-9-]+$/, '소문자·숫자·하이픈만 사용할 수 있습니다.')
        .nullable(),
    )
    .optional(),
  sortOrder: sortOrderField(),
  visibility: visibilityField(),
};

/** POST /admin/skills. 서버 관리 필드(id, createdAt 등)는 정의되지 않은 필드로 400. */
export const createSkillBodySchema = z.strictObject(skillShape);

/** PATCH /admin/skills/:id */
export const updateSkillBodySchema = toPatchSchema(skillShape);

// 목록 쿼리 (API.md 5.5). 기술 목록은 공개·관리자 모두 페이지네이션 없이 전체 반환 (page·limit은 400).
export const SKILL_SEARCH_FIELDS = ['name'];

/** GET /skills: 필터만, 정렬은 고정 (sort·q는 400) */
export const publicSkillListQuerySchema = listQuerySchema(
  { category: enumParam(SKILL_CATEGORIES), status: enumParam(SKILL_STATUSES) },
  { paginated: false },
);

/** GET /admin/skills */
export const adminSkillListQuerySchema = listQuerySchema(
  {
    q: searchParam(),
    category: enumParam(SKILL_CATEGORIES),
    status: enumParam(SKILL_STATUSES),
    visibility: enumParam(VISIBILITIES),
  },
  { paginated: false, sortFields: ['name', 'sortOrder', 'updatedAt'] },
);
