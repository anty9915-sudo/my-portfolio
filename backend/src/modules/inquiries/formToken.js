import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// 서명된 문의 폼 토큰 (API.md 8.8, DESIGN_REVIEW.md 3.1 2층).
// 형식: base64url(JSON { t: 발급 시각(ms), n: 무작위 값 }) + "." + base64url(HMAC-SHA256(FORM_TOKEN_SECRET, 앞부분))
// DB에 저장하지 않는다. 1시간 안에는 같은 토큰을 다시 쓸 수 있으며, 빈도 제한이 이를 보완한다.

export const FORM_TOKEN_MIN_AGE_MS = 3 * 1000; // 이보다 빨리 제출하면 봇으로 보고 조용히 거부
export const FORM_TOKEN_MAX_AGE_MS = 60 * 60 * 1000; // 이보다 오래되면 만료 (400)
const CLOCK_SKEW_MS = 5 * 1000; // 발급 시각이 이보다 미래면 위조로 본다
const MAX_TOKEN_LENGTH = 512;

const toBase64Url = (buffer) => Buffer.from(buffer).toString('base64url');

function sign(secret, payload) {
  return toBase64Url(createHmac('sha256', secret).update(payload).digest());
}

function signaturesMatch(expected, actual) {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** @returns {{ formToken: string, issuedAt: number, expiresAt: Date }} */
export function issueFormToken(secret, now = Date.now()) {
  const payload = toBase64Url(JSON.stringify({ t: now, n: randomBytes(8).toString('hex') }));
  return {
    formToken: `${payload}.${sign(secret, payload)}`,
    issuedAt: now,
    expiresAt: new Date(now + FORM_TOKEN_MAX_AGE_MS),
  };
}

/**
 * 토큰을 검증한다.
 * @returns {'valid' | 'too-fast' | 'expired' | 'invalid'}
 *  - invalid: 형식 오류, 서명 불일치(위조·다른 비밀키), 미래 발급 시각 → 400
 *  - expired: 발급 후 1시간 초과 → 400
 *  - too-fast: 서명은 맞지만 발급 후 3초 미만 → 저장하지 않고 202
 */
export function verifyFormToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) return 'invalid';
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return 'invalid';
  const [payload, signature] = parts;
  if (!signaturesMatch(sign(secret, payload), signature)) return 'invalid';

  let issuedAt;
  try {
    issuedAt = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).t;
  } catch {
    return 'invalid';
  }
  if (!Number.isSafeInteger(issuedAt) || issuedAt > now + CLOCK_SKEW_MS) return 'invalid';

  const age = now - issuedAt;
  if (age > FORM_TOKEN_MAX_AGE_MS) return 'expired';
  if (age < FORM_TOKEN_MIN_AGE_MS) return 'too-fast';
  return 'valid';
}
