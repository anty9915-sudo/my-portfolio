import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { addDays, daysBetween, kstDayStartMs, toKstDateKey } from '../../src/utils/kstDate.js';
import { lastFinalizedDateKey, rollupDay, rollupMissingDays } from '../../src/modules/visits/rollup.js';
import { VisitDailyStat } from '../../src/modules/visits/visitDailyStat.model.js';
import { VISIT_EVENT_RETENTION_SECONDS, VisitEvent } from '../../src/modules/visits/visitEvent.model.js';
import { computeDedupKey } from '../../src/modules/visits/visitorHash.js';
import { TEST_ORIGIN, testAppConfig } from '../helpers/config.js';
import { SETUP_TIMEOUT_MS, silentLogger, startContentTestEnv } from '../helpers/content.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148';
const STORED_KEYS = ['_id', 'dateKey', 'dedupKey', 'deviceType', 'occurredAt', 'path', 'referrerHost', 'visitorHash'];

/** 마감이 확실한 날짜 (자정 후 5분 유예와 무관하게): 오늘 − n일 (n ≥ 2) */
const daysAgo = (n) => addDays(toKstDateKey(new Date()), -n);

/** 원본 이벤트를 직접 넣기 위한 문서 (API를 거치지 않고 특정 날짜·방문자 시나리오를 만든다) */
function eventOn(dateKey, { hour = 12, minute = 0, path = '/', visitor = 'A', referrerHost = null, deviceType = 'desktop' } = {}) {
  const occurredAt = new Date(kstDayStartMs(dateKey) + (hour * 60 + minute) * 60_000);
  const visitorHash = createHash('sha256').update(`${visitor}:${dateKey}`).digest('hex');
  return {
    occurredAt,
    dateKey,
    path,
    referrerHost,
    deviceType,
    visitorHash,
    dedupKey: computeDedupKey(visitorHash, path, occurredAt.getTime()),
  };
}

describe('방문 통계', () => {
  let env;

  before(async () => {
    env = await startContentTestEnv();
    await Promise.all([VisitEvent.init(), VisitDailyStat.init()]); // 테스트 DB에 unique·TTL 인덱스 생성
  }, { timeout: SETUP_TIMEOUT_MS });

  after(async () => env?.stop());
  beforeEach(async () => Promise.all([VisitEvent.deleteMany({}), VisitDailyStat.deleteMany({})]));

  function freshApp() {
    const app = createApp(testAppConfig, { logger: silentLogger });
    const visit = (body, { userAgent = UA, headers = {} } = {}) => {
      const req = request(app).post('/api/v1/visits').set('Origin', TEST_ORIGIN).set('User-Agent', userAgent);
      for (const [name, value] of Object.entries(headers)) req.set(name, value);
      return req.send(body);
    };
    return { app, visit };
  }

  describe('POST /visits 기록', () => {
    it('204, 저장 필드에 IP·User-Agent·referrer 원문이 없다', async () => {
      const res = await freshApp()
        .visit({ path: '/projects/my-app/?tab=1#top', referrer: 'https://WWW.Google.com/search?q=secret-term' })
        .expect(204);
      assert.equal(res.text, '');
      assert.equal(res.headers['set-cookie'], undefined, '익명 방문자에게 쿠키를 발급하지 않는다');

      const stored = await VisitEvent.findOne().lean();
      assert.deepEqual(Object.keys(stored).sort(), STORED_KEYS);
      assert.equal(stored.path, '/projects/my-app');
      assert.equal(stored.referrerHost, 'www.google.com');
      assert.equal(stored.deviceType, 'desktop');
      assert.equal(stored.dateKey, toKstDateKey(stored.occurredAt));
      assert.match(stored.visitorHash, /^[0-9a-f]{64}$/);
      assert.match(stored.dedupKey, /^[0-9a-f]{64}$/);
      const serialized = JSON.stringify(stored);
      for (const forbidden of ['127.0.0.1', '::ffff', 'Chrome', 'Windows', 'secret-term', 'search?q', 'tab=1']) {
        assert.ok(!serialized.includes(forbidden), forbidden);
      }
    });

    it('자기 사이트·http/https 아닌·해석 불가 referrer는 null', async () => {
      const { visit } = freshApp();
      await visit({ path: '/a', referrer: 'http://localhost:5173/projects' }).expect(204);
      await visit({ path: '/b', referrer: 'android-app://com.example' }).expect(204);
      await visit({ path: '/c', referrer: 'not a url' }).expect(204);
      await visit({ path: '/d', referrer: null }).expect(204);
      const hosts = (await VisitEvent.find().lean()).map((event) => event.referrerHost);
      assert.deepEqual(hosts, [null, null, null, null]);
    });

    it('30분 중복 제거: 같은 방문자·같은 경로는 1건, 경로나 방문자(UA)가 다르면 따로', async () => {
      const { visit } = freshApp();
      await visit({ path: '/' }).expect(204);
      await visit({ path: '/?again=1' }).expect(204); // 정규화 후 같은 경로
      assert.equal(await VisitEvent.countDocuments(), 1);
      await visit({ path: '/projects' }).expect(204);
      await visit({ path: '/' }, { userAgent: UA_IPHONE }).expect(204);
      const events = await VisitEvent.find().lean();
      assert.equal(events.length, 3);
      assert.equal(new Set(events.map((event) => event.visitorHash)).size, 2);
    });

    it('관리자 세션·봇·빈 User-Agent·prefetch는 기록하지 않고 204', async () => {
      await env.agent.post('/api/v1/visits').set('Origin', TEST_ORIGIN).set('User-Agent', UA).send({ path: '/' }).expect(204);
      const { visit } = freshApp();
      await visit({ path: '/' }, { userAgent: 'Googlebot/2.1 (+http://www.google.com/bot.html)' }).expect(204);
      await visit({ path: '/' }, { userAgent: '' }).expect(204);
      await visit({ path: '/' }, { headers: { 'Sec-Purpose': 'prefetch;prerender' } }).expect(204);
      await visit({ path: '/' }, { headers: { Purpose: 'prefetch' } }).expect(204);
      assert.equal(await VisitEvent.countDocuments(), 0);
    });

    it('잘못된 입력은 400 (기록 안 함), Origin이 없으면 403', async () => {
      const { app, visit } = freshApp();
      for (const body of [{}, { path: 'projects' }, { path: '/a b' }, { path: `/${'a'.repeat(200)}` }, { path: '/', foo: 1 }, { path: '/', referrer: 1 }]) {
        const res = await visit(body);
        assert.equal(res.status, 400, JSON.stringify(body).slice(0, 50));
        assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      }
      await request(app).post('/api/v1/visits').set('User-Agent', UA).send({ path: '/' }).expect(403);
      assert.equal(await VisitEvent.countDocuments(), 0);
    });

    it('IP당 1분 60회를 넘으면 429', async () => {
      const { visit } = freshApp();
      for (let i = 0; i < 60; i += 1) await visit({ path: `/p${i}` }).expect(204);
      const limited = await visit({ path: '/over' }).expect(429);
      assert.equal(limited.body.error.code, 'RATE_LIMITED');
    });
  });

  describe('일별 집계', () => {
    it('가장 이른 원본 이벤트 날짜부터 마감된 날짜를 집계하고, 그 사이 방문이 없는 날은 0으로 저장한다', async () => {
      const day = daysAgo(2);
      const firstDay = daysAgo(6); // 가장 이른 원본 이벤트 날짜
      await VisitEvent.insertMany([
        eventOn(firstDay, { visitor: 'F', path: '/first' }),
        eventOn(day, { visitor: 'A', path: '/' }),
        eventOn(day, { visitor: 'A', path: '/projects', deviceType: 'desktop' }),
        eventOn(day, { visitor: 'B', path: '/', deviceType: 'mobile', referrerHost: 'github.com' }),
        eventOn(day, { visitor: 'C', path: '/', deviceType: 'tablet', referrerHost: 'github.com' }),
        eventOn(daysAgo(3), { visitor: 'Z', path: '/old', hour: 23, minute: 59 }),
      ]);

      const now = Date.now();
      const filled = await rollupMissingDays(now);
      const expectedDays = daysBetween(firstDay, lastFinalizedDateKey(now)) + 1;
      assert.equal(filled[0], firstDay, '최초 이벤트 날짜부터 시작');
      assert.equal(filled.length, expectedDays);
      assert.equal(await VisitDailyStat.countDocuments(), expectedDays);
      assert.equal(await VisitDailyStat.countDocuments({ dateKey: daysAgo(7) }), 0, '최초 이벤트 이전 날짜는 저장 안 함');
      assert.equal((await VisitDailyStat.findOne({ dateKey: firstDay }).lean()).pageviews, 1);

      const stat = await VisitDailyStat.findOne({ dateKey: day }).lean();
      assert.equal(stat.pageviews, 4);
      assert.equal(stat.uniqueVisitors, 3);
      assert.deepEqual(stat.topPaths, [{ path: '/', pageviews: 3 }, { path: '/projects', pageviews: 1 }]);
      assert.deepEqual(stat.topReferrers, [{ host: 'github.com', count: 2 }]);
      assert.deepEqual(stat.devices, { desktop: 2, mobile: 1, tablet: 1, unknown: 0 });

      const previous = await VisitDailyStat.findOne({ dateKey: daysAgo(3) }).lean();
      assert.equal(previous.pageviews, 1, 'KST 23:59 이벤트는 그날에 속한다');
      for (const zeroDay of [daysAgo(5), daysAgo(4)]) {
        const empty = await VisitDailyStat.findOne({ dateKey: zeroDay }).lean();
        assert.deepEqual([empty.pageviews, empty.uniqueVisitors, empty.topPaths], [0, 0, []], `${zeroDay}는 0`);
      }
    });

    it('다시 실행하면 새로 집계하지 않고, rollupDay로 다시 집계해도 같은 결과', async () => {
      const day = daysAgo(2);
      await VisitEvent.insertMany([eventOn(day, { visitor: 'A' }), eventOn(day, { visitor: 'B' })]);
      await rollupMissingDays();
      const first = await VisitDailyStat.findOne({ dateKey: day }).lean();
      assert.deepEqual(await rollupMissingDays(), []);
      const unchanged = await VisitDailyStat.findOne({ dateKey: day }).lean();
      assert.equal(unchanged.computedAt.getTime(), first.computedAt.getTime());

      await rollupDay(day);
      const recomputed = await VisitDailyStat.findOne({ dateKey: day }).lean();
      assert.deepEqual(
        [recomputed.pageviews, recomputed.uniqueVisitors, recomputed.topPaths, recomputed.devices],
        [first.pageviews, first.uniqueVisitors, first.topPaths, first.devices],
      );
      assert.equal(await VisitDailyStat.countDocuments({ dateKey: day }), 1);
    });

    it('상위 경로는 최대 20개, 많은 순·같으면 경로순', async () => {
      const day = daysAgo(4);
      const events = [];
      for (let i = 0; i < 25; i += 1) events.push(eventOn(day, { visitor: `v${i}`, path: `/p${String(i).padStart(2, '0')}` }));
      events.push(eventOn(day, { visitor: 'extra', path: '/p24' }));
      await VisitEvent.insertMany(events);
      await rollupDay(day);
      const { topPaths } = await VisitDailyStat.findOne({ dateKey: day }).lean();
      assert.equal(topPaths.length, 20);
      assert.deepEqual(topPaths[0], { path: '/p24', pageviews: 2 });
      assert.deepEqual(topPaths.slice(1, 3).map((entry) => entry.path), ['/p00', '/p01']);
    });
  });

  describe('GET /admin/stats/visits', () => {
    const stats = (query = '') => env.admin.get(`/stats/visits${query}`);

    it('로그인하지 않으면 401', async () => {
      await env.anonymous.get('/stats/visits').expect(401);
    });

    it('기본 7일: 빈 날을 0으로 채운 연속 날짜, 오늘은 원본에서 실시간 (일별 집계에 저장 안 함)', async () => {
      await freshApp().visit({ path: '/' }).expect(204);
      const res = await stats().expect(200);
      const { range, daily, dataQuality } = res.body.data;
      const today = toKstDateKey(new Date());
      assert.deepEqual(range, { from: addDays(today, -6), to: today, timezone: 'Asia/Seoul' });
      assert.deepEqual(daily.map((day) => day.date), Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)));
      assert.deepEqual(daily[6], { date: today, pageviews: 1, uniqueVisitors: 1 });
      assert.deepEqual(dataQuality, { includesToday: true, approximateTopLists: false });
      assert.equal(await VisitDailyStat.countDocuments({ dateKey: today }), 0);
    });

    it('조회 시 누락된 마감 날짜를 보정하고 요약·기기·상위 목록을 계산한다', async () => {
      const day = daysAgo(2);
      await VisitEvent.insertMany([
        eventOn(day, { visitor: 'A', path: '/', referrerHost: 'github.com' }),
        eventOn(day, { visitor: 'B', path: '/', deviceType: 'mobile' }),
        eventOn(day, { visitor: 'B', path: '/projects', deviceType: 'mobile' }),
        eventOn(daysAgo(3), { visitor: 'C', path: '/projects' }),
      ]);
      assert.equal(await VisitDailyStat.countDocuments(), 0);

      const { data } = (await stats('?top=1').expect(200)).body;
      assert.ok(await VisitDailyStat.exists({ dateKey: day }), '대시보드 조회가 누락분을 채운다');
      assert.equal(data.summary.pageviews, 4);
      assert.equal(data.summary.dailyUniqueVisitorsSum, 3);
      assert.equal(data.summary.avgDailyUniqueVisitors, Math.round((3 / 7) * 10) / 10);
      assert.deepEqual(data.topPaths, [{ path: '/', pageviews: 2 }], 'top=1, 범위 전체 원본 기준');
      assert.deepEqual(data.topReferrers, [{ host: 'github.com', count: 1 }]);
      assert.deepEqual(data.devices, { desktop: 2, mobile: 2, tablet: 0, unknown: 0 });
    });

    it('원본 보관 기간 밖이 포함되면 일별 상위 목록 합산(근사) — approximateTopLists: true', async () => {
      const oldDay = daysAgo(100);
      await VisitDailyStat.create({
        dateKey: oldDay,
        pageviews: 50,
        uniqueVisitors: 20,
        topPaths: [{ path: '/old', pageviews: 50 }],
        topReferrers: [{ host: 'old.example', count: 5 }],
        devices: { desktop: 50, mobile: 0, tablet: 0, unknown: 0 },
        computedAt: new Date(),
      });
      await VisitEvent.insertMany([eventOn(daysAgo(2), { path: '/new' })]);

      const { data } = (await stats(`?from=${oldDay}`).expect(200)).body;
      assert.equal(data.daily.length, 101);
      assert.equal(data.daily[0].pageviews, 50);
      assert.equal(data.dataQuality.approximateTopLists, true);
      assert.deepEqual(data.topPaths, [{ path: '/old', pageviews: 50 }, { path: '/new', pageviews: 1 }]);
      assert.equal(await VisitDailyStat.countDocuments({ dateKey: daysAgo(99) }), 0, '보관 기간 밖 빈 날은 저장 안 함');
    });

    it('잘못된 조회 조건은 400', async () => {
      const today = toKstDateKey(new Date());
      for (const query of [
        `?to=${addDays(today, 1)}`,
        `?from=${addDays(today, -1)}&to=${addDays(today, -2)}`,
        `?from=${addDays(today, -365)}`,
        '?top=0',
        '?top=21',
        '?foo=1',
        '?from=2026-02-30',
      ]) {
        const res = await stats(query);
        assert.equal(res.status, 400, query);
      }
      await stats(`?from=${addDays(today, -364)}`).expect(200);
    });
  });

  describe('인덱스', () => {
    it('visit_events: dedupKey unique, occurredAt 90일 TTL / visit_daily_stats: dateKey unique', async () => {
      const eventIndexes = await VisitEvent.collection.indexes();
      assert.equal(eventIndexes.find((index) => index.name === 'dedupKey_unique').unique, true);
      const ttl = eventIndexes.find((index) => index.name === 'visit_events_ttl');
      assert.deepEqual(ttl.key, { occurredAt: 1 });
      assert.equal(ttl.expireAfterSeconds, VISIT_EVENT_RETENTION_SECONDS);
      assert.equal(VISIT_EVENT_RETENTION_SECONDS, 7_776_000);
      const dailyIndexes = await VisitDailyStat.collection.indexes();
      assert.equal(dailyIndexes.find((index) => index.name === 'dateKey_unique').unique, true);
    });
  });
});
