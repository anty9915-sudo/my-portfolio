/**
 * 클라이언트에 그대로 전달해도 되는 오류. 공통 오류 처리 미들웨어가
 * API.md 2.4 형식으로 변환한다. 메시지에 내부 정보를 넣지 않는다.
 */
export class ApiError extends Error {
  /**
   * @param {number} status HTTP 상태 코드
   * @param {string} code API.md 3장의 오류 코드
   * @param {string} message 사용자에게 보여줄 메시지
   * @param {{ field: string, reason: string }[]} [details] 검증 오류 상세
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (details) this.details = details;
  }

  static validation(details) {
    return new ApiError(400, 'VALIDATION_ERROR', '요청 값을 확인해 주세요.', details);
  }

  static forbidden(message = '허용되지 않은 요청입니다.') {
    return new ApiError(403, 'FORBIDDEN', message);
  }

  static routeNotFound() {
    return new ApiError(404, 'ROUTE_NOT_FOUND', '요청한 경로를 찾을 수 없습니다.');
  }

  static unsupportedMediaType() {
    return new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', '요청 본문은 application/json 형식이어야 합니다.');
  }

  static serviceUnavailable(message = '일시적으로 서비스를 이용할 수 없습니다.') {
    return new ApiError(503, 'SERVICE_UNAVAILABLE', message);
  }

  static invalidId() {
    return new ApiError(400, 'INVALID_ID', '올바른 ID 형식이 아닙니다.');
  }

  /** 공개 API에서는 비공개 리소스도 이 오류로 응답한다 (존재 여부 비노출). */
  static notFound(message = '요청한 리소스를 찾을 수 없습니다.') {
    return new ApiError(404, 'NOT_FOUND', message);
  }

  /** @param {string} field 중복된 필드 이름 (값은 담지 않는다) */
  static duplicateKey(field) {
    return new ApiError(409, 'DUPLICATE_KEY', field ? `이미 사용 중인 값입니다 (${field}).` : '이미 사용 중인 값입니다.');
  }

  static resourceInUse(message = '다른 항목에서 사용 중이라 삭제할 수 없습니다.') {
    return new ApiError(409, 'RESOURCE_IN_USE', message);
  }

  /** 검증 오류 1건 */
  static invalidField(field, reason) {
    return ApiError.validation([{ field, reason }]);
  }

  static unauthenticated() {
    return new ApiError(401, 'UNAUTHENTICATED', '로그인이 필요합니다.');
  }

  /** 이메일·비밀번호 중 무엇이 틀렸는지 구분하지 않는다 (API.md 9.1). */
  static invalidCredentials() {
    return new ApiError(401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호가 올바르지 않습니다.');
  }

  /** @param {number} retryAfter 초 단위. errorHandler가 Retry-After 헤더로 보낸다. */
  static tooManyAttempts(retryAfter) {
    const error = new ApiError(429, 'TOO_MANY_ATTEMPTS', '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.');
    error.retryAfter = retryAfter;
    return error;
  }

  /** @param {number} retryAfter 초 단위 */
  static rateLimited(retryAfter) {
    const error = new ApiError(429, 'RATE_LIMITED', '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
    error.retryAfter = retryAfter;
    return error;
  }
}
