import { createHash } from 'node:crypto';

// 문의 스팸 검사 (DESIGN_REVIEW.md 3.1). 입력값을 로그·응답에 담지 않는다.

/** 메시지에 허용하는 URL 수. 이보다 많으면(4개 이상) 400 */
export const MAX_URLS_IN_MESSAGE = 3;

// http://, https://, www.로 시작하는 문자열만 URL로 센다. 접두어 없는 도메인(example.com)은 세지 않는다.
// "https://www.example.com"은 한 번만 센다 (\S+가 뒤의 www.까지 소비).
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/gi;

export function countUrls(text) {
  return (String(text).match(URL_PATTERN) ?? []).length;
}

/** 허니팟 website: 생략·null·빈 문자열이 아니면 "값이 있음" (공백도 값으로 본다) */
export function isHoneypotFilled(value) {
  return value !== undefined && value !== null && value !== '';
}

/** 공백 정규화: 앞뒤 공백 제거 + 줄바꿈을 포함한 연속 공백을 한 칸으로 */
export function normalizeMessage(message) {
  return message.trim().replace(/\s+/g, ' ');
}

/** contentHash = SHA-256(소문자 email + "\n" + 공백 정규화한 message) (DATABASE.md 4.6) */
export function computeContentHash(email, message) {
  return createHash('sha256').update(`${email.toLowerCase()}\n${normalizeMessage(message)}`).digest('hex');
}
