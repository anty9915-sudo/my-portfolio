import mongoose from 'mongoose';
import { VISIBILITIES } from '../../utils/fields.js';
import { adminMeta, toId } from '../../utils/serialize.js';

// skills 컬렉션 (DATABASE.md 4.3)
export const SKILL_CATEGORIES = ['language', 'frontend', 'backend', 'database', 'devops', 'security', 'tool', 'other'];
export const SKILL_STATUSES = ['planned', 'learning', 'applied', 'proficient'];
/** 대소문자 무시 이름 비교 (name_unique_ci 인덱스와 같은 collation) */
export const SKILL_NAME_COLLATION = { locale: 'en', strength: 2 };
/** 공개·관리자 목록 공통 정렬 (API.md 5.5) */
export const SKILL_LIST_SORT = { category: 1, sortOrder: 1, name: 1, _id: 1 };

const skillSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    slug: { type: String, required: true, trim: true, maxlength: 50 },
    category: { type: String, required: true, enum: SKILL_CATEGORIES },
    status: { type: String, required: true, enum: SKILL_STATUSES },
    description: { type: String, default: null, maxlength: 300 },
    iconKey: { type: String, default: null, maxlength: 50 },
    sortOrder: { type: Number, default: 0, min: 0, max: 9999 },
    visibility: { type: String, enum: VISIBILITIES, default: 'private' },
  },
  { collection: 'skills', timestamps: true, versionKey: false, strict: true },
);

skillSchema.index({ slug: 1 }, { unique: true, name: 'slug_unique' });
skillSchema.index({ name: 1 }, { unique: true, name: 'name_unique_ci', collation: SKILL_NAME_COLLATION });
skillSchema.index({ visibility: 1, category: 1, sortOrder: 1 }, { name: 'skills_public_list' });

export const Skill = mongoose.models.Skill ?? mongoose.model('Skill', skillSchema);

/** 프로젝트·학습 기록 응답에 포함되는 요약 */
export function toSkillSummary(skill) {
  return { id: toId(skill._id), name: skill.name, slug: skill.slug, category: skill.category };
}

/** GET /skills (API.md 8.5) */
export function toPublicSkill(skill) {
  return {
    id: toId(skill._id),
    name: skill.name,
    slug: skill.slug,
    category: skill.category,
    status: skill.status,
    description: skill.description ?? null,
    iconKey: skill.iconKey ?? null,
  };
}

export function toAdminSkill(skill) {
  return { ...toPublicSkill(skill), sortOrder: skill.sortOrder, ...adminMeta(skill) };
}
