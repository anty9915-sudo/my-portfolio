// User-Agent·요청 헤더 기반 판정 (DESIGN_REVIEW.md 2.3). UA 원문은 저장하지 않는다.

export const DEVICE_TYPES = ['desktop', 'mobile', 'tablet', 'unknown'];

// 크롤러·미리보기·모니터링 도구·HTTP 라이브러리
const BOT_PATTERN =
  /bot|crawl|spider|slurp|scrap|headless|phantomjs|lighthouse|pagespeed|pingdom|uptime|monitor|preview|facebookexternalhit|embedly|curl|wget|python-requests|python-urllib|httpclient|okhttp|axios|node-fetch|undici|go-http-client|java\/|libwww|postman/i;

/** 봇이거나 User-Agent가 비어 있으면 true → 기록하지 않음 */
export function isBotUserAgent(userAgent) {
  return typeof userAgent !== 'string' || userAgent.trim() === '' || BOT_PATTERN.test(userAgent);
}

/** prefetch·prerender·미리보기 요청이면 true → 기록하지 않음 */
export function isPrefetchRequest(headers) {
  const header = (name) => String(headers[name] ?? '');
  return (
    /prefetch|prerender/i.test(header('sec-purpose')) ||
    /prefetch/i.test(header('purpose')) ||
    /preview/i.test(header('x-purpose')) ||
    /prefetch/i.test(header('x-moz'))
  );
}

/**
 * 기기 유형. iPadOS Safari는 데스크톱(Macintosh) UA를 보내므로 desktop으로 분류된다 (알려진 한계).
 * @returns {'desktop' | 'mobile' | 'tablet' | 'unknown'}
 */
export function detectDeviceType(userAgent) {
  const ua = String(userAgent ?? '');
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Windows Phone|BlackBerry/i.test(ua)) return 'mobile';
  if (/Windows NT|Macintosh|X11|Linux|CrOS/i.test(ua)) return 'desktop';
  return 'unknown';
}
