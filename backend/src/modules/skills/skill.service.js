import { ApiError } from '../../utils/ApiError.js';
import { buildSort, searchFilter } from '../../utils/listQuery.js';
import { assertReferencesExist, assertUniqueSlug, loadSummaries, notId } from '../../utils/references.js';
import { Project } from '../projects/project.model.js';
import { StudyRecord } from '../study-records/studyRecord.model.js';
import { Skill, SKILL_LIST_SORT, SKILL_NAME_COLLATION, toSkillSummary } from './skill.model.js';
import { SKILL_SEARCH_FIELDS } from './skill.validation.js';

// 기술은 최대 200건 수준이라 목록은 페이지네이션 없이 전체를 반환한다 (API.md 5.5).

function applyFilters(filter, query) {
  if (query.category) filter.category = query.category;
  if (query.status) filter.status = query.status;
  return filter;
}

/** 공개: visibility는 항상 public으로 고정, 정렬은 기본 정렬 고정 */
export function listPublicSkills(query = {}) {
  return Skill.find(applyFilters({ visibility: 'public' }, query)).sort(SKILL_LIST_SORT).lean();
}

/** 관리자: 이름 검색, visibility 필터, sort 지정 가능 */
export function listAdminSkills(query = {}) {
  const filter = applyFilters({}, query);
  if (query.visibility) filter.visibility = query.visibility;
  return Skill.find({ ...filter, ...searchFilter(query.q, SKILL_SEARCH_FIELDS) })
    .sort(buildSort(query.sort, SKILL_LIST_SORT))
    .lean();
}

export async function getSkill(id) {
  const skill = await Skill.findById(id).lean();
  if (!skill) throw ApiError.notFound();
  return skill;
}

/** 이 기술을 참조하는 프로젝트·학습 기록 수 (GET /admin/skills/:id의 usage) */
export async function getSkillUsage(id) {
  const [projects, studyRecords] = await Promise.all([
    Project.countDocuments({ skillIds: id }),
    StudyRecord.countDocuments({ skillIds: id }),
  ]);
  return { projects, studyRecords };
}

async function assertUniqueName(name, excludeId) {
  if (name === undefined) return;
  const filter = excludeId ? { name, _id: notId(excludeId) } : { name };
  if (await Skill.exists(filter).collation(SKILL_NAME_COLLATION)) throw ApiError.duplicateKey('name');
}

export async function createSkill(body) {
  await assertUniqueSlug(Skill, body.slug);
  await assertUniqueName(body.name);
  const skill = await Skill.create(body);
  return skill.toObject();
}

export async function updateSkill(id, body) {
  const skill = await Skill.findById(id);
  if (!skill) throw ApiError.notFound();
  await assertUniqueSlug(Skill, body.slug, id);
  await assertUniqueName(body.name, id);
  skill.set(body);
  await skill.save();
  return skill.toObject();
}

/** 참조 중이면 409 RESOURCE_IN_USE — 관리자가 먼저 연결을 해제해야 한다 (DATABASE.md 5.4). */
export async function deleteSkill(id) {
  const skill = await Skill.findById(id);
  if (!skill) throw ApiError.notFound();
  const usage = await getSkillUsage(id);
  if (usage.projects > 0 || usage.studyRecords > 0) {
    throw ApiError.resourceInUse('다른 항목에서 사용 중인 기술은 삭제할 수 없습니다.');
  }
  await Skill.deleteOne({ _id: skill._id });
}

/**
 * 목록의 skill(slug) 필터용. 공개 API는 공개 기술만 찾는다:
 * 비공개 기술의 slug는 존재하지 않는 slug와 똑같이 null → 빈 목록 (존재·연결 관계 비노출).
 */
export async function findSkillIdBySlug(slug, { publicOnly }) {
  const filter = publicOnly ? { slug, visibility: 'public' } : { slug };
  const skill = await Skill.findOne(filter, '_id').lean();
  return skill?._id ?? null;
}

/** 프로젝트·학습 기록 생성·수정 시 skillIds 검증 */
export function assertSkillsExist(ids) {
  return assertReferencesExist(Skill, ids, 'skillIds', '존재하지 않는 기술이 포함되어 있습니다.');
}

/** 응답용 기술 요약 맵. 공개 응답에서는 비공개 기술을 제외한다. */
export function loadSkillSummaries(ids, { publicOnly }) {
  return loadSummaries(Skill, ids, {
    publicOnly,
    projection: 'name slug category visibility',
    toSummary: toSkillSummary,
  });
}
