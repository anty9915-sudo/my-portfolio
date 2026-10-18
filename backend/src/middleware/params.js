import { ApiError } from '../utils/ApiError.js';
import { OBJECT_ID_PATTERN, SLUG_PATTERN } from '../utils/fields.js';

/** 관리자 API의 :id — ObjectId 형식이 아니면 400 INVALID_ID (API.md 3장) */
export function validateIdParam(req, res, next) {
  if (!OBJECT_ID_PATTERN.test(req.params.id)) return next(ApiError.invalidId());
  req.params.id = req.params.id.toLowerCase();
  return next();
}

/** 공개 API의 :slug — 형식이 맞지 않으면 존재 여부와 같은 404 (API.md 8.4) */
export function validateSlugParam(req, res, next) {
  const { slug } = req.params;
  if (slug.length > 80 || !SLUG_PATTERN.test(slug)) return next(ApiError.notFound());
  return next();
}
