import { ApiError } from '../../utils/ApiError.js';
import { buildSort, dateRangeFilter, searchFilter } from '../../utils/listQuery.js';
import { emptyPage, paginate } from '../../utils/pagination.js';
import { assertReferencesExist, assertUniqueSlug, loadSummaries, resolveReferences } from '../../utils/references.js';
import { Project, toProjectSummary } from '../projects/project.model.js';
import { assertSkillsExist, findSkillIdBySlug, loadSkillSummaries } from '../skills/skill.service.js';
import {
  STUDY_RECORD_ADMIN_SORT,
  STUDY_RECORD_LIST_PROJECTION,
  STUDY_RECORD_PUBLIC_SORT,
  StudyRecord,
  toAdminStudyRecord,
  toAdminStudyRecordListItem,
  toPublicStudyRecord,
  toPublicStudyRecordListItem,
} from './studyRecord.model.js';
import { STUDY_RECORD_SEARCH_FIELDS } from './studyRecord.validation.js';

async function withSkills(records, { publicOnly }) {
  const summaries = await loadSkillSummaries(
    records.flatMap((record) => record.skillIds ?? []),
    { publicOnly },
  );
  return records.map((record) => ({ record, skills: resolveReferences(record.skillIds, summaries) }));
}

async function toDetail(record, { publicOnly }) {
  const [[{ skills }], projectSummaries] = await Promise.all([
    withSkills([record], { publicOnly }),
    loadSummaries(Project, record.projectIds ?? [], {
      publicOnly,
      projection: 'slug title visibility',
      toSummary: toProjectSummary,
    }),
  ]);
  const relatedProjects = resolveReferences(record.projectIds, projectSummaries);
  const toResponse = publicOnly ? toPublicStudyRecord : toAdminStudyRecord;
  return toResponse(record, { skills, relatedProjects });
}

function assertProjectsExist(ids) {
  return assertReferencesExist(Project, ids, 'projectIds', '존재하지 않는 프로젝트가 포함되어 있습니다.');
}

/**
 * 목록 필터 (API.md 5.5). 검색어와 필터는 AND.
 * 공개 목록은 visibility를 항상 public으로 고정하고, 관리자만 visibility 필터를 쓸 수 있다.
 * @returns {Promise<object | null>} 결과가 있을 수 없으면 null (존재하지 않거나 공개 API에서 비공개인 기술)
 */
async function buildListFilter(query, { publicOnly }) {
  const filter = publicOnly ? { visibility: 'public' } : {};
  if (!publicOnly && query.visibility) filter.visibility = query.visibility;
  if (query.category) filter.category = query.category;
  if (query.tag) filter.tags = query.tag;
  const learnedAt = dateRangeFilter(query.from, query.to);
  if (learnedAt) filter.learnedAt = learnedAt;
  if (query.skill) {
    const skillId = await findSkillIdBySlug(query.skill, { publicOnly });
    if (!skillId) return null;
    filter.skillIds = skillId;
  }
  return { ...filter, ...searchFilter(query.q, STUDY_RECORD_SEARCH_FIELDS) };
}

async function listStudyRecords(query, { publicOnly }) {
  const filter = await buildListFilter(query, { publicOnly });
  if (!filter) return emptyPage(query);
  return paginate(StudyRecord, {
    filter,
    sort: buildSort(query.sort, publicOnly ? STUDY_RECORD_PUBLIC_SORT : STUDY_RECORD_ADMIN_SORT),
    projection: STUDY_RECORD_LIST_PROJECTION,
    page: query.page,
    limit: query.limit,
  });
}

// 공개 (visibility: public만)

export async function listPublicStudyRecords(query) {
  const { items, meta } = await listStudyRecords(query, { publicOnly: true });
  const rows = await withSkills(items, { publicOnly: true });
  return { data: rows.map(({ record, skills }) => toPublicStudyRecordListItem(record, { skills })), meta };
}

/** 비공개이거나 없으면 같은 404 */
export async function getPublicStudyRecord(slug) {
  const record = await StudyRecord.findOne({ slug, visibility: 'public' }).lean();
  if (!record) throw ApiError.notFound();
  return toDetail(record, { publicOnly: true });
}

// 관리자 (비공개 포함)

export async function listAdminStudyRecords(query) {
  const { items, meta } = await listStudyRecords(query, { publicOnly: false });
  const rows = await withSkills(items, { publicOnly: false });
  return { data: rows.map(({ record, skills }) => toAdminStudyRecordListItem(record, { skills })), meta };
}

export async function getAdminStudyRecord(id) {
  const record = await StudyRecord.findById(id).lean();
  if (!record) throw ApiError.notFound();
  return toDetail(record, { publicOnly: false });
}

export async function createStudyRecord(body) {
  await assertSkillsExist(body.skillIds);
  await assertProjectsExist(body.projectIds);
  await assertUniqueSlug(StudyRecord, body.slug);
  const record = await StudyRecord.create({
    ...body,
    publishedAt: body.visibility === 'public' ? new Date() : null,
  });
  return toDetail(record.toObject(), { publicOnly: false });
}

export async function updateStudyRecord(id, body) {
  const record = await StudyRecord.findById(id);
  if (!record) throw ApiError.notFound();

  await assertSkillsExist(body.skillIds);
  await assertProjectsExist(body.projectIds);
  await assertUniqueSlug(StudyRecord, body.slug, id);

  record.set(body);
  if (record.visibility === 'public' && !record.publishedAt) record.publishedAt = new Date();
  await record.save();
  return toDetail(record.toObject(), { publicOnly: false });
}

/** 학습 기록을 참조하는 컬렉션은 없으므로 바로 삭제한다 (DATABASE.md 5.4). */
export async function deleteStudyRecord(id) {
  const record = await StudyRecord.findByIdAndDelete(id);
  if (!record) throw ApiError.notFound();
}
