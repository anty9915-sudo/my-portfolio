import { z } from 'zod';
import {
  dateField,
  objectIdArray,
  optionalHttpsUrl,
  optionalText,
  requiredText,
  slugField,
  sortOrderField,
  tagsField,
  toPatchSchema,
  VISIBILITIES,
  visibilityField,
} from '../../utils/fields.js';
import { booleanParam, enumParam, listQuerySchema, searchParam, slugParam, tagParam } from '../../utils/listQuery.js';

const projectShape = {
  title: requiredText(100),
  slug: slugField(3, 80),
  summary: requiredText(200),
  description: requiredText(20000),
  role: optionalText(200),
  teamSize: z.number().int('정수여야 합니다.').min(1, '1 이상이어야 합니다.').max(50, '50 이하여야 합니다.').nullable().optional(),
  highlights: z.array(requiredText(200)).max(10, '최대 10개까지 입력할 수 있습니다.').optional(),
  startedAt: dateField(),
  endedAt: dateField().nullable().optional(),
  skillIds: objectIdArray(30),
  tags: tagsField(),
  githubUrl: optionalHttpsUrl(),
  demoUrl: optionalHttpsUrl(),
  thumbnailUrl: optionalHttpsUrl(),
  featured: z.boolean().optional(),
  sortOrder: sortOrderField(),
  visibility: visibilityField(),
};

export const ENDED_BEFORE_STARTED = 'startedAt 이후 날짜여야 합니다.';

/** POST /admin/projects (API.md 10.2) */
export const createProjectBodySchema = z.strictObject(projectShape).superRefine((body, ctx) => {
  if (body.endedAt && body.endedAt < body.startedAt) {
    ctx.addIssue({ code: 'custom', path: ['endedAt'], message: ENDED_BEFORE_STARTED });
  }
});

/** PATCH /admin/projects/:id — startedAt·endedAt 순서는 기존 값과 합쳐 서비스에서 확인한다. */
export const updateProjectBodySchema = toPatchSchema(projectShape);

// 목록 쿼리 (API.md 5.5)
export const PROJECT_SEARCH_FIELDS = ['title', 'summary', 'tags'];
const PUBLIC_SORT_FIELDS = ['sortOrder', 'startedAt', 'title', 'publishedAt'];
const ADMIN_SORT_FIELDS = [...PUBLIC_SORT_FIELDS, 'createdAt', 'updatedAt'];

const projectFilters = {
  q: searchParam(),
  skill: slugParam(50), // 기술 slug
  tag: tagParam(),
  featured: booleanParam(),
};

/** GET /projects */
export const publicProjectListQuerySchema = listQuerySchema(projectFilters, { sortFields: PUBLIC_SORT_FIELDS });

/** GET /admin/projects */
export const adminProjectListQuerySchema = listQuerySchema(
  { ...projectFilters, visibility: enumParam(VISIBILITIES) },
  { sortFields: ADMIN_SORT_FIELDS },
);
