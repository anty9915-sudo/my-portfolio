import { Router } from 'express';
import { isDatabaseConnected } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { sendSuccess } from '../../utils/response.js';

/**
 * GET /health (API.md 8.1). 버전·호스트·연결 문자열 등은 반환하지 않는다.
 * @param {{ isDbConnected?: () => boolean }} [deps] 테스트에서 DB 상태를 대체할 때 사용
 */
export function createHealthRouter({ isDbConnected = isDatabaseConnected } = {}) {
  const router = Router();

  router.get('/health', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!isDbConnected()) {
      return next(ApiError.serviceUnavailable('데이터베이스에 연결할 수 없습니다.'));
    }
    return sendSuccess(res, { status: 'ok', database: 'up' });
  });

  return router;
}
