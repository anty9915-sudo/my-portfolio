import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDays, dateKeysInRange, daysBetween, kstDayStartMs, toKstDateKey } from '../../src/utils/kstDate.js';
import {
  createSerialRunner,
  lastFinalizedDateKey,
  rawRetentionStartKey,
  rollupStartKey,
} from '../../src/modules/visits/rollup.js';
import { ROLLUP_INTERVAL_MS, startRollupScheduler } from '../../src/modules/visits/rollupScheduler.js';
import { detectDeviceType, isBotUserAgent, isPrefetchRequest } from '../../src/modules/visits/userAgent.js';
import {
  extractReferrerHost,
  normalizePath,
  resolveStatsRange,
  visitBodySchema,
  visitStatsQuerySchema,
} from '../../src/modules/visits/visit.validation.js';
import { computeDedupKey, computeVisitorHash, dedupBucket } from '../../src/modules/visits/visitorHash.js';

const SECRET = 'unit-visit-secret-'.padEnd(40, 'v');
const UA_CHROME_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';

describe('KST 날짜', () => {
  it('toKstDateKey: UTC 15:00이 KST 자정 경계', () => {
    assert.equal(toKstDateKey(new Date('2026-10-15T14:59:59.999Z')), '2026-10-15');
    assert.equal(toKstDateKey(new Date('2026-10-15T15:00:00.000Z')), '2026-10-16');
    assert.equal(toKstDateKey(new Date('2026-12-31T15:00:00.000Z')), '2027-01-01', '연도 경계');
  });

  it('kstDayStartMs·addDays·daysBetween·dateKeysInRange', () => {
    assert.equal(new Date(kstDayStartMs('2026-10-16')).toISOString(), '2026-10-15T15:00:00.000Z');
    assert.equal(addDays('2026-02-28', 1), '2026-03-01');
    assert.equal(addDays('2026-01-01', -1), '2025-12-31');
    assert.equal(daysBetween('2026-10-09', '2026-10-15'), 6);
    assert.deepEqual(dateKeysInRange('2026-12-30', '2027-01-02'), ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  });

  it('lastFinalizedDateKey: KST 자정 후 5분이 지나야 전날을 마감한다', () => {
    const midnightKst = Date.parse('2026-10-16T00:00:00+09:00');
    assert.equal(lastFinalizedDateKey(midnightKst + 4 * 60_000 + 59_999), '2026-10-14', '00:04:59 — 10/15 미마감');
    assert.equal(lastFinalizedDateKey(midnightKst + 5 * 60_000), '2026-10-15', '00:05 — 10/15 마감');
  });

  it('rollupStartKey: 이벤트가 없으면 null, 있으면 최초 이벤트 날짜와 보관 기간 시작일 중 늦은 날', () => {
    const now = Date.parse('2026-10-16T12:00:00+09:00');
    const retentionStart = rawRetentionStartKey(now);
    assert.equal(rollupStartKey(undefined, now), null);
    assert.equal(rollupStartKey(null, now), null);
    assert.equal(rollupStartKey('2026-10-10', now), '2026-10-10');
    assert.equal(rollupStartKey(addDays(retentionStart, -30), now), retentionStart);
    assert.equal(rollupStartKey(retentionStart, now), retentionStart);
  });

  it('rawRetentionStartKey: KST 00:00이 지금으로부터 90일 이내인 첫 날', () => {
    const now = Date.parse('2026-10-16T12:00:00+09:00');
    const start = rawRetentionStartKey(now);
    assert.ok(kstDayStartMs(start) >= now - 90 * 86_400_000);
    assert.ok(kstDayStartMs(addDays(start, -1)) < now - 90 * 86_400_000);
  });
});

describe('visitorHash·dedupKey', () => {
  it('같은 날·같은 IP·UA면 같은 값, 날짜·비밀값·UA·IP가 다르면 다른 값, 원문을 담지 않는다', () => {
    const base = computeVisitorHash(SECRET, '2026-10-16', '203.0.113.7', UA_CHROME_WINDOWS);
    assert.match(base, /^[0-9a-f]{64}$/);
    assert.equal(computeVisitorHash(SECRET, '2026-10-16', '203.0.113.7', UA_CHROME_WINDOWS), base);
    assert.notEqual(computeVisitorHash(SECRET, '2026-10-17', '203.0.113.7', UA_CHROME_WINDOWS), base, '다음 날');
    assert.notEqual(computeVisitorHash(`${SECRET}x`, '2026-10-16', '203.0.113.7', UA_CHROME_WINDOWS), base);
    assert.notEqual(computeVisitorHash(SECRET, '2026-10-16', '203.0.113.8', UA_CHROME_WINDOWS), base);
    assert.notEqual(computeVisitorHash(SECRET, '2026-10-16', '203.0.113.7', 'other'), base);
    assert.ok(!base.includes('203'));
  });

  it('30분 고정 구간: 10:01과 10:29는 같고, 10:29와 10:31은 다르다 (KST·UTC 경계 동일)', () => {
    const at = (time) => Date.parse(`2026-10-16T${time}:00+09:00`);
    assert.equal(dedupBucket(at('10:01')), dedupBucket(at('10:29')));
    assert.notEqual(dedupBucket(at('10:29')), dedupBucket(at('10:31')));
    assert.equal(dedupBucket(at('10:30')), dedupBucket(at('10:59')));
    const hash = 'a'.repeat(64);
    assert.equal(computeDedupKey(hash, '/', at('10:01')), computeDedupKey(hash, '/', at('10:29')));
    assert.notEqual(computeDedupKey(hash, '/', at('10:01')), computeDedupKey(hash, '/projects', at('10:01')));
    assert.notEqual(computeDedupKey(hash, '/', at('10:29')), computeDedupKey(hash, '/', at('10:31')));
  });
});

describe('User-Agent·헤더 판정', () => {
  it('봇·빈 User-Agent', () => {
    for (const ua of ['Googlebot/2.1 (+http://www.google.com/bot.html)', 'curl/8.4.0', 'python-requests/2.31', 'HeadlessChrome/120', 'facebookexternalhit/1.1', '', '   ', undefined]) {
      assert.equal(isBotUserAgent(ua), true, String(ua));
    }
    assert.equal(isBotUserAgent(UA_CHROME_WINDOWS), false);
  });

  it('prefetch·prerender·미리보기 헤더', () => {
    assert.equal(isPrefetchRequest({ 'sec-purpose': 'prefetch' }), true);
    assert.equal(isPrefetchRequest({ 'sec-purpose': 'prefetch;prerender' }), true);
    assert.equal(isPrefetchRequest({ purpose: 'prefetch' }), true);
    assert.equal(isPrefetchRequest({ 'x-purpose': 'preview' }), true);
    assert.equal(isPrefetchRequest({ 'x-moz': 'prefetch' }), true);
    assert.equal(isPrefetchRequest({}), false);
  });

  it('기기 유형', () => {
    assert.equal(detectDeviceType(UA_CHROME_WINDOWS), 'desktop');
    assert.equal(detectDeviceType('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605'), 'desktop');
    assert.equal(detectDeviceType('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148'), 'mobile');
    assert.equal(detectDeviceType('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130 Mobile Safari'), 'mobile');
    assert.equal(detectDeviceType('Mozilla/5.0 (iPad; CPU OS 17_0) Safari'), 'tablet');
    assert.equal(detectDeviceType('Mozilla/5.0 (Linux; Android 14; SM-X710) Chrome/130 Safari'), 'tablet');
    assert.equal(detectDeviceType('SomethingElse/1.0'), 'unknown');
  });
});

describe('경로·referrer', () => {
  it('normalizePath: 쿼리·해시 제거, 끝의 / 제거(루트 유지), 대소문자·인코딩 유지', () => {
    assert.equal(normalizePath('/projects/my-app/?tab=1#top'), '/projects/my-app');
    assert.equal(normalizePath('/'), '/');
    assert.equal(normalizePath('/?utm=x'), '/');
    assert.equal(normalizePath('///'), '/');
    assert.equal(normalizePath('/About/%ED%95%9C'), '/About/%ED%95%9C');
  });

  it('visitBodySchema: / 시작, 정규화 후 200자, 허용 문자만, 정의된 필드만', () => {
    assert.equal(visitBodySchema.parse({ path: '/a/?x=1' }).path, '/a');
    assert.equal(visitBodySchema.parse({ path: `/${'a'.repeat(199)}` }).path.length, 200);
    assert.equal(visitBodySchema.parse({ path: `/${'a'.repeat(199)}/?long-query=${'q'.repeat(500)}` }).path.length, 200);
    for (const body of [
      {},
      { path: 'projects' },
      { path: '?x=1' },
      { path: `/${'a'.repeat(200)}` },
      { path: '/a b' },
      { path: '/한글' },
      { path: '/<script>' },
      { path: '/', foo: 1 },
      { path: '/', referrer: 123 },
      { path: '/', referrer: `https://a.com/${'x'.repeat(2048)}` },
    ]) {
      assert.equal(visitBodySchema.safeParse(body).success, false, JSON.stringify(body).slice(0, 60));
    }
  });

  it('extractReferrerHost: 외부 http/https 호스트만, 그 외·자기 사이트는 null', () => {
    assert.equal(extractReferrerHost('https://WWW.Google.com/search?q=x', 'localhost'), 'www.google.com');
    assert.equal(extractReferrerHost('http://github.com/a', 'localhost'), 'github.com');
    for (const referrer of ['http://localhost:5173/projects', 'android-app://com.x', 'ftp://a.com', 'not a url', '', null, undefined]) {
      assert.equal(extractReferrerHost(referrer, 'localhost'), null, String(referrer));
    }
  });
});

describe('통계 조회 기간', () => {
  const today = '2026-10-16';

  it('기본: 오늘 포함 7일, to만 주면 to−6일부터, from만 주면 오늘까지', () => {
    assert.deepEqual(resolveStatsRange({}, today), { from: '2026-10-10', to: '2026-10-16' });
    assert.deepEqual(resolveStatsRange({ to: '2026-10-01' }, today), { from: '2026-09-25', to: '2026-10-01' });
    assert.deepEqual(resolveStatsRange({ from: '2026-10-14' }, today), { from: '2026-10-14', to: '2026-10-16' });
  });

  it('미래 to, from > to, 365일 초과는 400 (365일은 허용)', () => {
    const fieldOf = (query) => {
      try {
        resolveStatsRange(query, today);
      } catch (error) {
        return [error.status, error.details[0].field];
      }
      return null;
    };
    assert.deepEqual(fieldOf({ to: '2026-10-17' }), [400, 'to']);
    assert.deepEqual(fieldOf({ from: '2026-10-17' }), [400, 'from']);
    assert.deepEqual(fieldOf({ from: '2026-10-10', to: '2026-10-09' }), [400, 'from']);
    assert.deepEqual(fieldOf({ from: addDays(today, -365) }), [400, 'from'], '366일');
    assert.equal(fieldOf({ from: addDays(today, -364) }), null, '365일');
  });

  it('visitStatsQuerySchema: top 1~20, 정의되지 않은 파라미터 거부', () => {
    assert.equal(visitStatsQuerySchema.parse({ top: '20' }).top, 20);
    for (const query of [{ top: '0' }, { top: '21' }, { top: 'x' }, { foo: '1' }, { from: '2026-02-30' }]) {
      assert.equal(visitStatsQuerySchema.safeParse(query).success, false, JSON.stringify(query));
    }
  });
});

describe('집계 실행 겹침 방지·스케줄러', () => {
  it('createSerialRunner: 실행 중이면 같은 실행을 함께 기다리고, 끝나면 다시 실행할 수 있다', async () => {
    let calls = 0;
    let release;
    const runner = createSerialRunner(() => {
      calls += 1;
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const first = runner();
    const second = runner();
    assert.equal(first, second);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 1);
    release(['2026-10-15']);
    assert.deepEqual(await second, ['2026-10-15']);
    const third = runner();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 2);
    release([]);
    await third;
  });

  it('startRollupScheduler: 시작 즉시 1회 + 1시간 주기, 실패해도 멈추지 않고 로그, stop은 타이머 정리', async () => {
    const logs = { info: [], error: [] };
    const logger = { info: (m) => logs.info.push(m), error: (m) => logs.error.push(m) };
    const timer = { unrefCalled: false, unref() { this.unrefCalled = true; } };
    let registered;
    let cleared;
    let runs = 0;
    const scheduler = startRollupScheduler({
      logger,
      run: async () => {
        runs += 1;
        if (runs === 2) throw new Error('DB 일시 오류');
        return runs === 1 ? ['2026-10-14', '2026-10-15'] : [];
      },
      setIntervalFn: (fn, ms) => {
        registered = { fn, ms };
        return timer;
      },
      clearIntervalFn: (handle) => {
        cleared = handle;
      },
    });

    await scheduler.ready;
    assert.equal(runs, 1, '시작하자마자 1회');
    assert.equal(registered.ms, ROLLUP_INTERVAL_MS);
    assert.equal(ROLLUP_INTERVAL_MS, 60 * 60 * 1000);
    assert.equal(timer.unrefCalled, true);
    assert.deepEqual(logs.info, ['[visits] 일별 집계 완료: 2일']);

    await registered.fn(); // 2번째 주기: 실패
    assert.equal(logs.error.length, 1);
    await registered.fn(); // 3번째 주기: 다시 시도
    assert.equal(runs, 3);

    scheduler.stop();
    assert.equal(cleared, timer);
  });
});
