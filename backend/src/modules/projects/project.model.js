import mongoose from 'mongoose';
import { VISIBILITIES } from '../../utils/fields.js';
import { adminMeta, toId, toIso } from '../../utils/serialize.js';

// projects 컬렉션 (DATABASE.md 4.2)
export const PROJECT_PUBLIC_SORT = { sortOrder: 1, startedAt: -1, _id: -1 };
export const PROJECT_ADMIN_SORT = { updatedAt: -1, _id: -1 };
/** 목록에서 제외하는 긴 필드 (API.md 8.3) */
export const PROJECT_LIST_PROJECTION = '-description -highlights';

const projectSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, trim: true, maxlength: 80 },
    summary: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, maxlength: 20000 },
    role: { type: String, default: null, maxlength: 200 },
    teamSize: { type: Number, default: null, min: 1, max: 50 },
    highlights: { type: [String], default: [] },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    skillIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Skill' }], default: [] },
    tags: { type: [String], default: [] },
    githubUrl: { type: String, default: null },
    demoUrl: { type: String, default: null },
    thumbnailUrl: { type: String, default: null },
    featured: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0, min: 0, max: 9999 },
    visibility: { type: String, enum: VISIBILITIES, default: 'private' },
    publishedAt: { type: Date, default: null },
  },
  { collection: 'projects', timestamps: true, versionKey: false, strict: true },
);

projectSchema.index({ slug: 1 }, { unique: true, name: 'slug_unique' });
projectSchema.index({ visibility: 1, sortOrder: 1, startedAt: -1, _id: -1 }, { name: 'projects_public_list' });
projectSchema.index({ skillIds: 1, visibility: 1 }, { name: 'projects_skillIds' });

export const Project = mongoose.models.Project ?? mongoose.model('Project', projectSchema);

/** 학습 기록 상세의 relatedProjects 항목 */
export function toProjectSummary(project) {
  return { id: toId(project._id), slug: project.slug, title: project.title };
}

/** GET /projects 목록 항목 (API.md 8.3) */
export function toPublicProjectListItem(project, { skills }) {
  return {
    id: toId(project._id),
    slug: project.slug,
    title: project.title,
    summary: project.summary,
    startedAt: toIso(project.startedAt),
    endedAt: toIso(project.endedAt),
    featured: project.featured,
    thumbnailUrl: project.thumbnailUrl ?? null,
    tags: project.tags ?? [],
    skills,
    publishedAt: toIso(project.publishedAt),
  };
}

/** GET /projects/:slug (API.md 8.4) */
export function toPublicProject(project, { skills, relatedStudyRecords }) {
  return {
    ...toPublicProjectListItem(project, { skills }),
    description: project.description,
    role: project.role ?? null,
    teamSize: project.teamSize ?? null,
    highlights: project.highlights ?? [],
    githubUrl: project.githubUrl ?? null,
    demoUrl: project.demoUrl ?? null,
    relatedStudyRecords,
    updatedAt: toIso(project.updatedAt),
  };
}

function adminProjectFields(project) {
  return {
    skillIds: (project.skillIds ?? []).map(toId),
    sortOrder: project.sortOrder,
    ...adminMeta(project),
  };
}

/** 관리자 목록 항목: 공개 목록 필드 + 관리자 필드 (API.md 10장) */
export function toAdminProjectListItem(project, { skills }) {
  return { ...toPublicProjectListItem(project, { skills }), ...adminProjectFields(project) };
}

/** 관리자 상세: 공개 상세 필드 + 관리자 필드 */
export function toAdminProject(project, { skills, relatedStudyRecords }) {
  return { ...toPublicProject(project, { skills, relatedStudyRecords }), ...adminProjectFields(project) };
}
