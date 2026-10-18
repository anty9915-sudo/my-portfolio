import { rateLimit } from 'express-rate-limit';
import { ApiError } from '../utils/ApiError.js';

// 요청 빈도 제한 (API.md 6장). 1단계는 단일 인스턴스 메모리 저장소. 키는 req.ip(trust proxy 설정 반영).
export const LOGIN_RATE_LIMIT = { windowMs: 15 * 60 * 1000, limit: 10 };
/** 그 외 공개 GET: 1분에 120회 */
export const PUBLIC_READ_RATE_LIMIT = { windowMs: 60 * 1000, limit: 120 };
/** GET /inquiries/form-token: 10분에 20회 */
export const FORM_TOKEN_RATE_LIMIT = { windowMs: 10 * 60 * 1000, limit: 20 };
/** POST /inquiries: 10분에 3회 + 24시간에 10회 (검증 실패·조용한 거부를 포함한 모든 시도) */
export const INQUIRY_SHORT_RATE_LIMIT = { windowMs: 10 * 60 * 1000, limit: 3 };
export const INQUIRY_DAILY_RATE_LIMIT = { windowMs: 24 * 60 * 60 * 1000, limit: 10 };
/** POST /visits: 1분에 60회 */
export const VISIT_RATE_LIMIT = { windowMs: 60 * 1000, limit: 60 };

/**
 * 한도 초과 시 429 RATE_LIMITED + Retry-After를 공통 오류 형식으로 보낸다.
 * 호출할 때마다 독립된 카운터를 가진 미들웨어를 만든다.
 */
export function createRateLimit({ windowMs, limit }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(req, res, next) {
      const resetTime = req.rateLimit?.resetTime;
      const retryAfter = resetTime
        ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : Math.ceil(windowMs / 1000);
      next(ApiError.rateLimited(retryAfter));
    },
  });
}
