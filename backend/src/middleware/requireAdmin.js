import { destroySession, SESSION_ABSOLUTE_MS, sessionCookieName, sessionCookieOptions } from '../config/session.js';
import { Admin } from '../modules/auth/admin.model.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * 관리자 세션을 확인한다 (API.md 4장).
 *  - 세션 없음 → 401
 *  - 로그인 후 12시간 초과(절대 만료) → 세션 삭제 후 401 (유휴 2시간 만료는 저장소·쿠키가 처리)
 *  - 관리자 문서 없음, 또는 loginAt이 passwordChangedAt보다 이전 → 세션 삭제 후 401
 * 통과하면 req.admin에 관리자 문서를 담는다.
 */
export function createRequireAdmin({ isProduction }) {
  const cookieName = sessionCookieName(isProduction);
  const cookieOptions = sessionCookieOptions(isProduction);

  async function reject(req, res, next) {
    await destroySession(req);
    res.clearCookie(cookieName, cookieOptions);
    next(ApiError.unauthenticated());
  }

  return async function requireAdmin(req, res, next) {
    const adminId = req.session?.adminId;
    const loginAt = req.session?.loginAt;
    if (typeof adminId !== 'string' || typeof loginAt !== 'number') {
      return next(ApiError.unauthenticated());
    }

    if (Date.now() - loginAt > SESSION_ABSOLUTE_MS) return reject(req, res, next);

    const admin = await Admin.findById(adminId);
    if (!admin) return reject(req, res, next);
    if (admin.passwordChangedAt && loginAt < admin.passwordChangedAt.getTime()) {
      return reject(req, res, next);
    }

    req.admin = admin;
    return next();
  };
}
