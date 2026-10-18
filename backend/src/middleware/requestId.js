import { randomBytes } from 'node:crypto';

/**
 * 요청마다 서버 로그와 오류 응답을 대조할 ID를 만든다 (API.md 2.4).
 * 클라이언트가 보낸 X-Request-Id는 로그 조작을 막기 위해 사용하지 않는다.
 */
export function requestId(req, res, next) {
  const id = randomBytes(4).toString('hex');
  req.id = id;
  res.set('X-Request-Id', id);
  next();
}
