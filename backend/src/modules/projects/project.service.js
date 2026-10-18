import { ApiError } from '../../utils/ApiError.js';
import { buildSort, searchFilter } from '../../utils/listQuery.js';
import { emptyPage, paginate } from '../../utils/pagination.js';
import { assertUniqueSlug, resolveReferences } from '../../utils/references.js';
import { assertSkillsExist, findSkillIdBySlug, loadSkillSummaries } from '../skills/skill.service.js';
import { STUDY_RECORD_RELATED_SORT, StudyRecord, toStudyRecordSummary } from '../study-records/studyRecord.model.js';
import {
  Project,
  PROJECT_ADMIN_SORT,
  PROJECT_LIST_PROJECTION,
  PROJECT_PUBLIC_SORT,
  toAdminProject,
  toAdminProjectListItem,
  toPublicProject,
  toPublicProjectListItem,
} from './project.model.js';
import { ENDED_BEFORE_STARTED, PROJECT_SEARCH_FIELDS } from './project.validation.js';

const RELATED_STUDY_RECORDS_LIMIT = 5;

async function withSkills(projects, { publicOnly }) {
  const summaries = await loadSkillSummaries(
    projects.flatMap((project) => project.skillIds ?? []),
    { publicOnly },
  );
  return projects.map((project) => ({ project, skills: resolveReferences(project.skillIds, summaries) }));
}

async function relatedStudyRecords(projectId, { publicOnly }) {
  const filter = publicOnly ? { projectIds: projectId, visibility: 'public' } : { projectIds: projectId };
  const records = await StudyRecord.find(filter, 'slug title learnedAt')
    .sort(STUDY_RECORD_RELATED_SORT)
    .limit(RELATED_STUDY_RECORDS_LIMIT)
    .lean();
  return records.map(toStudyRecordSummary);
}

async function toDetail(project, { publicOnly }) {
  const [[{ skills }], related] = await Promise.all([
    withSkills([project], { publicOnly }),
    relatedStudyRecords(project._id, { publicOnly }),
  ]);
  const toResponse = publicOnly ? toPublicProject : toAdminProject;
  return toResponse(project, { skills, relatedStudyRecords: related });
}

/**
 * 목록 필터 (API.md 5.5). 검색어와 필터는 AND.
 * 공개 목록은 visibility를 항상 public으로 고정하고, 관리자만 visibility 필터를 쓸 수 있다.
 * @returns {Promise<object | null>} 결과가 있을 수 없으면 null (존재하지 않거나 공개 API에서 비공개인 기술)
 */
async function buildListFilter(query, { publicOnly }) {
  const filter = publicOnly ? { visibility: 'public' } : {};
  if (!publicOnly && query.visibility) filter.visibility = query.visibility;
  if (query.featured !== undefined) filter.featured = query.featured;
  if (query.tag) filter.tags = query.tag;
  if (query.skill) {
    const skillId = await findSkillIdBySlug(query.skill, { publicOnly });
    if (!skillId) return null;
    filter.skillIds = skillId;
  }
  return { ...filter, ...searchFilter(query.q, PROJECT_SEARCH_FIELDS) };
}

async function listProjects(query, { publicOnly }) {
  const filter = await buildListFilter(query, { publicOnly });
  if (!filter) return emptyPage(query);
  return paginate(Project, {
    filter,
    sort: buildSort(query.sort, publicOnly ? PROJECT_PUBLIC_SORT : PROJECT_ADMIN_SORT),
    projection: PROJECT_LIST_PROJECTION,
    page: query.page,
    limit: query.limit,
  });
}

// 공개 (visibility: public만)

export async function listPublicProjects(query) {
  const { items, meta } = await listProjects(query, { publicOnly: true });
  const rows = await withSkills(items, { publicOnly: true });
  return { data: rows.map(({ project, skills }) => toPublicProjectListItem(project, { skills })), meta };
}

/** 비공개이거나 없으면 같은 404 (API.md 3장) */
export async function getPublicProject(slug) {
  const project = await Project.findOne({ slug, visibility: 'public' }).lean();
  if (!project) throw ApiError.notFound();
  return toDetail(project, { publicOnly: true });
}

// 관리자 (비공개 포함)

export async function listAdminProjects(query) {
  const { items, meta } = await listProjects(query, { publicOnly: false });
  const rows = await withSkills(items, { publicOnly: false });
  return { data: rows.map(({ project, skills }) => toAdminProjectListItem(project, { skills })), meta };
}

export async function getAdminProject(id) {
  const project = await Project.findById(id).lean();
  if (!project) throw ApiError.notFound();
  return toDetail(project, { publicOnly: false });
}

export async function createProject(body) {
  await assertSkillsExist(body.skillIds);
  await assertUniqueSlug(Project, body.slug);
  const project = await Project.create({
    ...body,
    publishedAt: body.visibility === 'public' ? new Date() : null,
  });
  return toDetail(project.toObject(), { publicOnly: false });
}

export async function updateProject(id, body) {
  const project = await Project.findById(id);
  if (!project) throw ApiError.notFound();

  const startedAt = body.startedAt ?? project.startedAt;
  const endedAt = 'endedAt' in body ? body.endedAt : project.endedAt;
  if (endedAt && endedAt < startedAt) throw ApiError.invalidField('endedAt', ENDED_BEFORE_STARTED);

  await assertSkillsExist(body.skillIds);
  await assertUniqueSlug(Project, body.slug, id);

  project.set(body);
  // 처음 공개될 때만 기록하고, 이후 비공개로 바꿔도 유지한다 (DATABASE.md 4.2)
  if (project.visibility === 'public' && !project.publishedAt) project.publishedAt = new Date();
  await project.save();
  return toDetail(project.toObject(), { publicOnly: false });
}

/**
 * 삭제 후 학습 기록의 projectIds에서 참조를 뺀다 (DATABASE.md 5.4).
 * 정리에 실패해도 남은 참조는 조회 시 무시되므로 삭제는 성공으로 처리하고 로그만 남긴다.
 */
export async function deleteProject(id, { logger = console } = {}) {
  const project = await Project.findByIdAndDelete(id);
  if (!project) throw ApiError.notFound();
  try {
    await StudyRecord.updateMany({ projectIds: project._id }, { $pull: { projectIds: project._id } });
  } catch (error) {
    logger.error(`프로젝트 삭제 후 학습 기록 참조 정리 실패 (projectId=${project._id})`, error);
  }
}
