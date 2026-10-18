import { ApiError } from '../utils/ApiError.js';

export function hasBody(req) {
  const length = req.headers['content-length'];
  return req.headers['transfer-encoding'] !== undefined || (length !== undefined && length !== '0');
}

function isJsonContentType(header) {
  if (!header) return false;
  return header.split(';')[0].trim().toLowerCase() === 'application/json';
}

/**
 * 본문이 있는 요청은 application/json만 허용한다 (API.md 1장).
 * 로그아웃처럼 본문이 없는 요청은 검사하지 않는다.
 */
export function requireJsonContentType(req, res, next) {
  if (!hasBody(req)) return next();
  if (isJsonContentType(req.headers['content-type'])) return next();
  return next(ApiError.unsupportedMediaType());
}
