import { ApiError } from '../utils/ApiError.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF 방어: 모든 비-GET 요청은 Origin 헤더가 CLIENT_ORIGIN과 같아야 한다.
 * 불일치 또는 헤더 누락 → 403 FORBIDDEN (API.md 4장).
 */
export function originCheck(allowedOrigin) {
  return function checkOrigin(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();
    if (req.headers.origin === allowedOrigin) return next();
    return next(ApiError.forbidden('허용되지 않은 요청 출처입니다.'));
  };
}
