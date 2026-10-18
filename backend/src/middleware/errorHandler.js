import { ApiError } from '../utils/ApiError.js';
import { buildErrorBody } from '../utils/response.js';

// body-parser(express.json) 오류 타입 → API 오류 (API.md 3장)
const BODY_PARSER_ERRORS = {
  'entity.parse.failed': [400, 'INVALID_JSON', 'JSON 형식이 올바르지 않습니다.'],
  'entity.too.large': [413, 'PAYLOAD_TOO_LARGE', '요청 크기가 허용 범위를 초과했습니다.'],
  'charset.unsupported': [415, 'UNSUPPORTED_MEDIA_TYPE', '지원하지 않는 문자 인코딩입니다.'],
  'encoding.unsupported': [415, 'UNSUPPORTED_MEDIA_TYPE', '지원하지 않는 본문 인코딩입니다.'],
};

const MONGO_DUPLICATE_KEY = 11000;

/**
 * 모든 오류를 공통 오류 형식으로 변환한다.
 * 예상하지 못한 오류는 서버 로그에만 남기고, 응답에는 일반 문구만 보낸다.
 * 로그에는 요청 본문이나 쿼리스트링을 남기지 않는다 (개인정보 보호).
 */
export function createErrorHandler({ logger = console } = {}) {
  return function errorHandler(err, req, res, next) {
    if (res.headersSent) return next(err);

    let status;
    let code;
    let message;
    let details;

    if (err instanceof ApiError) {
      ({ status, code, message, details } = err);
      if (err.retryAfter) res.set('Retry-After', String(err.retryAfter));
    } else if (err && BODY_PARSER_ERRORS[err.type]) {
      [status, code, message] = BODY_PARSER_ERRORS[err.type];
    } else if (err?.code === MONGO_DUPLICATE_KEY) {
      // 서비스의 사전 검사를 통과한 동시 요청 등: unique 인덱스 위반 → 409 (필드 이름만 노출)
      ({ status, code, message } = ApiError.duplicateKey(Object.keys(err.keyPattern ?? {})[0]));
    } else {
      status = 500;
      code = 'INTERNAL_ERROR';
      message = '서버 오류가 발생했습니다.';
      logger.error(`[${req.id ?? '-'}] ${req.method} ${req.path} 처리 중 오류`, err);
    }

    return res.status(status).json(buildErrorBody({ code, message, details, requestId: req.id }));
  };
}
