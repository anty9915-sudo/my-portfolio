import { toKstDateKey } from '../../utils/kstDate.js';
import { detectDeviceType } from './userAgent.js';
import { extractReferrerHost } from './visit.validation.js';
import { VisitEvent } from './visitEvent.model.js';
import { computeDedupKey, computeVisitorHash } from './visitorHash.js';

const MONGO_DUPLICATE_KEY = 11000;

/**
 * 페이지뷰 1건을 기록한다 (제외 판정은 라우트에서 먼저 한다).
 * IP·User-Agent는 해시·기기 유형 계산에만 쓰고 저장하지 않는다.
 * 같은 30분 구간의 중복은 dedupKey_unique 인덱스가 막는다 (인덱스가 없으면 중복 저장된다).
 * @returns {Promise<'recorded' | 'duplicate'>}
 */
export async function recordVisit({ path, referrer }, { ip, userAgent, visitHashSecret, ownHostname, now = Date.now() }) {
  const dateKey = toKstDateKey(new Date(now));
  const visitorHash = computeVisitorHash(visitHashSecret, dateKey, ip ?? '', userAgent);
  try {
    await VisitEvent.create({
      occurredAt: new Date(now),
      dateKey,
      path,
      referrerHost: extractReferrerHost(referrer, ownHostname),
      deviceType: detectDeviceType(userAgent),
      visitorHash,
      dedupKey: computeDedupKey(visitorHash, path, now),
    });
    return 'recorded';
  } catch (error) {
    if (error?.code === MONGO_DUPLICATE_KEY) return 'duplicate';
    throw error;
  }
}
