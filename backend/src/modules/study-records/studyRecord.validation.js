import { z } from 'zod';
import {
  dateField,
  isNotFutureDate,
  objectIdArray,
  optionalText,
  requiredText,
  slugField,
  tagsField,
  toPatchSchema,
  VISIBILITIES,
  visibilityField,
} from '../../utils/fields.js';
import { dateParam, enumParam, listQuerySchema, searchParam, slugParam, tagParam } from '../../utils/listQuery.js';
import { STUDY_RECORD_CATEGORIES } from './studyRecord.model.js';

const studyRecordShape = {
  title: requiredText(120),
  slug: slugField(3, 80),
  category: z.enum(STUDY_RECORD_CATEGORIES),
  summary: optionalText(300),
  content: requiredText(50000),
  skillIds: objectIdArray(20),
  projectIds: objectIdArray(10),
  tags: tagsField(),
  learnedAt: dateField().refine((date) => isNotFutureDate(date), '미래 날짜는 사용할 수 없습니다.'),
  visibility: visibilityField(),
};

/** POST /admin/study-records (API.md 10.4) */
export const createStudyRecordBodySchema = z.strictObject(studyRecordShape);

/** PATCH /admin/study-records/:id */
export const updateStudyRecordBodySchema = toPatchSchema(studyRecordShape);

// 목록 쿼리 (API.md 5.5)
export const STUDY_RECORD_SEARCH_FIELDS = ['title', 'summary', 'tags'];
const PUBLIC_SORT_FIELDS = ['learnedAt', 'title'];
const ADMIN_SORT_FIELDS = [...PUBLIC_SORT_FIELDS, 'createdAt', 'updatedAt'];

const studyRecordFilters = {
  q: searchParam(),
  category: enumParam(STUDY_RECORD_CATEGORIES),
  skill: slugParam(50), // 기술 slug
  tag: tagParam(),
  from: dateParam(), // learnedAt 범위 (KST 날짜, 양 끝 포함)
  to: dateParam(),
};

/** GET /study-records */
export const publicStudyRecordListQuerySchema = listQuerySchema(studyRecordFilters, {
  sortFields: PUBLIC_SORT_FIELDS,
  dateRange: true,
});

/** GET /admin/study-records */
export const adminStudyRecordListQuerySchema = listQuerySchema(
  { ...studyRecordFilters, visibility: enumParam(VISIBILITIES) },
  { sortFields: ADMIN_SORT_FIELDS, dateRange: true },
);
