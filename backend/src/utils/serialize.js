// 응답 변환 공통 함수 (API.md 1장: id는 문자열, 날짜는 ISO-8601, 값이 없으면 null)

export function toId(value) {
  return value.toString();
}

export function toIso(value) {
  return value instanceof Date ? value.toISOString() : null;
}

/** 관리자 응답에만 붙는 공통 필드 (sortOrder는 해당 컬렉션의 변환 함수에서 추가) */
export function adminMeta(doc) {
  return {
    visibility: doc.visibility,
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
  };
}

/** Mongoose 문서 또는 lean 객체를 받아 일반 객체로 */
export function plain(doc) {
  return typeof doc?.toObject === 'function' ? doc.toObject() : doc;
}
