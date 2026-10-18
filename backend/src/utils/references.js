import mongoose from 'mongoose';
import { ApiError } from './ApiError.js';

/**
 * sanitizeFilter가 켜져 있으므로 서버가 만든 연산자는 mongoose.trusted()로 감싼다.
 * 사용자 입력은 Zod로 ObjectId 문자열 배열임을 검증한 뒤에만 넘긴다.
 */
export function inIds(ids) {
  return mongoose.trusted({ $in: ids });
}

export function notId(id) {
  return mongoose.trusted({ $ne: id });
}

/** 참조 ID가 모두 존재하는지 확인한다. 없으면 400 VALIDATION_ERROR (DATABASE.md 5.4) */
export async function assertReferencesExist(model, ids, field, reason) {
  if (!ids || ids.length === 0) return;
  const count = await model.countDocuments({ _id: inIds(ids) });
  if (count !== ids.length) throw ApiError.invalidField(field, reason);
}

/** slug 중복이면 409 DUPLICATE_KEY. 수정 시 자기 자신은 제외한다. */
export async function assertUniqueSlug(model, slug, excludeId) {
  if (slug === undefined) return;
  const filter = excludeId ? { slug, _id: notId(excludeId) } : { slug };
  if (await model.exists(filter)) throw ApiError.duplicateKey('slug');
}

/**
 * 참조 배열을 저장 순서대로 요약 객체 배열로 바꾼다. 맵에 없는 ID(삭제됐거나 공개 응답에서 제외된 비공개 항목)는 뺀다.
 * @param {Array<import('mongoose').Types.ObjectId | string>} ids
 * @param {Map<string, object>} summaries
 */
export function resolveReferences(ids, summaries) {
  return (ids ?? []).map((id) => summaries.get(id.toString())).filter(Boolean);
}

/** ID 목록으로 문서를 한 번에 조회해 id → 요약 맵을 만든다. */
export async function loadSummaries(model, ids, { publicOnly, projection, toSummary }) {
  const unique = [...new Set(ids.map((id) => id.toString()))];
  if (unique.length === 0) return new Map();
  const filter = publicOnly ? { _id: inIds(unique), visibility: 'public' } : { _id: inIds(unique) };
  const docs = await model.find(filter, projection).lean();
  return new Map(docs.map((doc) => [doc._id.toString(), toSummary(doc)]));
}
