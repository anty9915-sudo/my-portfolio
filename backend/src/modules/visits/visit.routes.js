import { Router } from 'express';
import { createRateLimit, VISIT_RATE_LIMIT } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/response.js';
import { getVisitStats } from './stats.service.js';
import { isBotUserAgent, isPrefetchRequest } from './userAgent.js';
import { visitBodySchema, visitStatsQuerySchema } from './visit.validation.js';
import { recordVisit } from './visit.service.js';

/**
 * 공개: POST /visits (API.md 8.10). 순서: 빈도 제한(429) → 입력 검증(400) → 제외 판정 → 기록. 그 외에는 항상 204.
 * 제외(기록하지 않고 204): 세션에 adminId가 있는 요청, 봇·빈 User-Agent, prefetch 요청.
 * 관리자 제외는 프론트엔드가 credentials: 'include'로 보내 세션 쿠키가 전달될 때만 동작한다.
 * 로그인하지 않은 방문자에게는 쿠키를 발급하지 않는다 (세션 saveUninitialized: false).
 */
export function createPublicVisitRouter({ visitHashSecret, clientOrigin }) {
  if (!visitHashSecret) throw new Error('방문자 해시 계산에 visitHashSecret이 필요합니다.');
  const ownHostname = new URL(clientOrigin).hostname.toLowerCase();
  const router = Router();

  router.post('/visits', createRateLimit(VISIT_RATE_LIMIT), validate({ body: visitBodySchema }), async (req, res) => {
    const userAgent = req.get('user-agent') ?? '';
    const excluded =
      typeof req.session?.adminId === 'string' || isBotUserAgent(userAgent) || isPrefetchRequest(req.headers);
    if (!excluded) {
      await recordVisit(req.validated.body, { ip: req.ip, userAgent, visitHashSecret, ownHostname });
    }
    res.status(204).end();
  });

  return router;
}

/** 관리자: GET /admin/stats/visits (API.md 12.1). requireAdmin은 /admin 라우터에서 적용한다. */
export function createAdminStatsRouter() {
  const router = Router();

  router.get('/stats/visits', validate({ query: visitStatsQuerySchema }), async (req, res) => {
    sendSuccess(res, await getVisitStats(req.validated.query));
  });

  return router;
}
