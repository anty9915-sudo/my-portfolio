import mongoose from 'mongoose';
import { VISIBILITIES } from '../../utils/fields.js';
import { adminMeta, toId, toIso } from '../../utils/serialize.js';

// study_records 컬렉션 (DATABASE.md 4.4)
export const STUDY_RECORD_CATEGORIES = ['study', 'troubleshooting'];
export const STUDY_RECORD_PUBLIC_SORT = { learnedAt: -1, _id: -1 };
export const STUDY_RECORD_ADMIN_SORT = { updatedAt: -1, _id: -1 };
/** 프로젝트 상세의 관련 학습 기록 정렬 (API.md 8.4) */
export const STUDY_RECORD_RELATED_SORT = { learnedAt: -1, _id: -1 };
/** 목록에서 본문 제외 (API.md 8.6) */
export const STUDY_RECORD_LIST_PROJECTION = '-content';

const studyRecordSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, trim: true, maxlength: 80 },
    category: { type: String, required: true, enum: STUDY_RECORD_CATEGORIES },
    summary: { type: String, default: null, maxlength: 300 },
    content: { type: String, required: true, maxlength: 50000 },
    skillIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Skill' }], default: [] },
    projectIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }], default: [] },
    tags: { type: [String], default: [] },
    learnedAt: { type: Date, required: true },
    visibility: { type: String, enum: VISIBILITIES, default: 'private' },
    publishedAt: { type: Date, default: null },
  },
  { collection: 'study_records', timestamps: true, versionKey: false, strict: true },
);

studyRecordSchema.index({ slug: 1 }, { unique: true, name: 'slug_unique' });
studyRecordSchema.index({ visibility: 1, learnedAt: -1, _id: -1 }, { name: 'study_records_public_list' });
studyRecordSchema.index({ skillIds: 1 }, { name: 'study_records_skillIds' });
studyRecordSchema.index({ projectIds: 1 }, { name: 'study_records_projectIds' });

export const StudyRecord = mongoose.models.StudyRecord ?? mongoose.model('StudyRecord', studyRecordSchema);

/** 프로젝트 상세의 relatedStudyRecords 항목 */
export function toStudyRecordSummary(record) {
  return { id: toId(record._id), slug: record.slug, title: record.title, learnedAt: toIso(record.learnedAt) };
}

/** GET /study-records 목록 항목 (API.md 8.6) */
export function toPublicStudyRecordListItem(record, { skills }) {
  return {
    id: toId(record._id),
    slug: record.slug,
    title: record.title,
    category: record.category,
    summary: record.summary ?? null,
    tags: record.tags ?? [],
    skills,
    learnedAt: toIso(record.learnedAt),
    publishedAt: toIso(record.publishedAt),
  };
}

/** GET /study-records/:slug (API.md 8.7) */
export function toPublicStudyRecord(record, { skills, relatedProjects }) {
  return {
    ...toPublicStudyRecordListItem(record, { skills }),
    content: record.content,
    relatedProjects,
    updatedAt: toIso(record.updatedAt),
  };
}

function adminStudyRecordFields(record) {
  return {
    skillIds: (record.skillIds ?? []).map(toId),
    projectIds: (record.projectIds ?? []).map(toId),
    ...adminMeta(record),
  };
}

export function toAdminStudyRecordListItem(record, { skills }) {
  return { ...toPublicStudyRecordListItem(record, { skills }), ...adminStudyRecordFields(record) };
}

export function toAdminStudyRecord(record, { skills, relatedProjects }) {
  return { ...toPublicStudyRecord(record, { skills, relatedProjects }), ...adminStudyRecordFields(record) };
}
