import { Router } from 'express';
import { destroySession, establishSession, sessionCookieName, sessionCookieOptions } from '../../config/session.js';
import { createRateLimit, LOGIN_RATE_LIMIT } from '../../middleware/rateLimit.js';
import { createRequireAdmin } from '../../middleware/requireAdmin.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/response.js';
import { toAdminResponse } from './admin.model.js';
import { authenticate, changePassword, deleteOtherSessions } from './auth.service.js';
import { changePasswordBodySchema, loginBodySchema } from './auth.validation.js';

/**
 * 인증 API (API.md 9장). Origin 검증은 app 전역 미들웨어가 모든 비-GET 요청에 적용한다.
 * @param {{ isProduction: boolean }} options
 */
export function createAuthRouter({ isProduction }) {
  const router = Router();
  const requireAdmin = createRequireAdmin({ isProduction });
  const cookieName = sessionCookieName(isProduction);
  const cookieOptions = sessionCookieOptions(isProduction);

  // 공개
  router.post(
    '/auth/login',
    createRateLimit(LOGIN_RATE_LIMIT),
    validate({ body: loginBodySchema }),
    async (req, res) => {
      const { email, password } = req.validated.body;
      const now = Date.now();
      const admin = await authenticate(email, password, now);
      await establishSession(req, admin.id, now);
      sendSuccess(res, { admin });
    },
  );

  // 세션 선택: 인증 미들웨어를 거치지 않고, 세션이 없어도 204 (멱등)
  router.post('/auth/logout', async (req, res) => {
    await destroySession(req);
    res.clearCookie(cookieName, cookieOptions);
    res.status(204).end();
  });

  // 관리자
  router.get('/auth/me', requireAdmin, (req, res) => {
    sendSuccess(res, toAdminResponse(req.admin));
  });

  router.patch('/auth/password', requireAdmin, validate({ body: changePasswordBodySchema }), async (req, res) => {
    const { currentPassword, newPassword } = req.validated.body;
    const adminId = req.admin._id.toString();
    const now = Date.now();
    await changePassword(adminId, currentPassword, newPassword, now);
    // 같은 now를 loginAt으로 써서 passwordChangedAt 검사를 통과하는 새 세션을 만든다.
    await establishSession(req, adminId, now);
    await deleteOtherSessions(adminId, req.sessionID);
    res.status(204).end();
  });

  return router;
}
