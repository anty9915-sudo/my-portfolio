// 공통 응답 형식 (API.md 2장)

export function sendSuccess(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function sendList(res, data, meta) {
  return res.status(200).json({ success: true, data, meta });
}

/** `details`는 검증 오류처럼 값이 있을 때만 포함한다. */
export function buildErrorBody({ code, message, details, requestId }) {
  const error = { code, message };
  if (details && details.length > 0) error.details = details;
  if (requestId) error.requestId = requestId;
  return { success: false, error };
}
