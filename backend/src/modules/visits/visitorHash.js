import { createHash, createHmac } from 'node:crypto';

// 방문자 식별값과 중복 제거 키 (DESIGN_REVIEW.md 2.1·2.2·2.4 A안).
// IP·User-Agent 원문은 이 계산에만 쓰고 저장하거나 로그에 남기지 않는다.

export const DEDUP_WINDOW_MINUTES = 30;

/** 일별 키 = HMAC-SHA256(VISIT_HASH_SECRET, KST 날짜 키). 서버를 재시작해도 같은 날이면 같다. */
export function dailyKey(secret, dateKey) {
  return createHmac('sha256', secret).update(dateKey).digest();
}

/** visitorHash = HMAC-SHA256(일별 키, IP + "\n" + User-Agent). 날짜가 바뀌면 같은 사람도 다른 값 */
export function computeVisitorHash(secret, dateKey, ip, userAgent) {
  return createHmac('sha256', dailyKey(secret, dateKey)).update(`${ip}\n${userAgent}`).digest('hex');
}

/**
 * 30분 고정 구간 번호 = floor(Unix 시각(분) / 30).
 * KST는 UTC와 정확히 9시간 차이라 구간 경계(:00, :30)가 두 시간대에서 같다.
 */
export function dedupBucket(occurredAtMs) {
  return Math.floor(occurredAtMs / 60_000 / DEDUP_WINDOW_MINUTES);
}

/** dedupKey = SHA-256(visitorHash + "\n" + 경로 + "\n" + 30분 구간 번호). unique 인덱스로 중복 저장을 막는다. */
export function computeDedupKey(visitorHash, path, occurredAtMs) {
  return createHash('sha256').update(`${visitorHash}\n${path}\n${dedupBucket(occurredAtMs)}`).digest('hex');
}
