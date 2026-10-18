import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { createAdmin } from '../../src/modules/auth/createAdmin.js';
import { lastFinalizedDateKey, rawRetentionStartKey, runRollup } from '../../src/modules/visits/rollup.js';
import { startRollupScheduler } from '../../src/modules/visits/rollupScheduler.js';
import { VisitDailyStat } from '../../src/modules/visits/visitDailyStat.model.js';
import { VisitEvent } from '../../src/modules/visits/visitEvent.model.js';
import { computeDedupKey } from '../../src/modules/visits/visitorHash.js';
import { addDays, daysBetween, kstDayStartMs, toKstDateKey } from '../../src/utils/kstDate.js';
import { TEST_ORIGIN, testAppConfig } from '../helpers/config.js';

// 서버와 같은 설정(autoIndex·autoCreate 끔)의 빈 DB에서 방문 통계 첫 실행 동작을 검증한다.

const SETUP_TIMEOUT_MS = 180_000;
const VISIT_COLLECTIONS = ['visit_events', 'visit_daily_stats'];
const daysAgo = (n) => addDays(toKstDateKey(new Date()), -n);

function eventOn(dateKey, visitor = 'A') {
  const occurredAt = new Date(kstDayStartMs(dateKey) + 12 * 60 * 60 * 1000);
  const visitorHash = createHash('sha256').update(`${visitor}:${dateKey}`).digest('hex');
  return {
    occurredAt,
    dateKey,
    path: '/',
    referrerHost: null,
    deviceType: 'desktop',
    visitorHash,
    dedupKey: computeDedupKey(visitorHash, '/', occurredAt.getTime()),
  };
}

async function collectionNames() {
  return (await mongoose.connection.db.listCollections().toArray()).map((collection) => collection.name);
}

/** 스케줄러를 실제 집계 함수로 시작하되, 주기 타이머만 대역으로 바꾼다 */
function startSchedulerOnce() {
  const scheduler = startRollupScheduler({
    logger: { info() {}, error() {} },
    setIntervalFn: () => ({ unref() {} }),
    clearIntervalFn: () => {},
  });
  return scheduler;
}

describe('방문 통계 첫 실행 (빈 DB, 서버와 같은 설정)', () => {
  let mongod;
  let admin;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('first_run_db'), { autoIndex: false, autoCreate: false });
    const password = `pw-${randomBytes(12).toString('hex')}`;
    await createAdmin({ email: 'admin@example.com', password }); // admins·sessions 컬렉션만 생긴다
    admin = request.agent(createApp(testAppConfig, { logger: { error() {} } }));
    await admin.post('/api/v1/auth/login').set('Origin', TEST_ORIGIN).send({ email: 'admin@example.com', password }).expect(200);
  }, { timeout: SETUP_TIMEOUT_MS });

  after(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  beforeEach(async () => {
    const existing = await collectionNames();
    for (const name of VISIT_COLLECTIONS) if (existing.includes(name)) await mongoose.connection.db.dropCollection(name);
  });

  it('원본 이벤트가 없으면 스케줄러 첫 실행·다음 주기 모두 컬렉션과 문서를 만들지 않는다', async () => {
    const scheduler = startSchedulerOnce();
    await scheduler.ready;
    assert.deepEqual(await runRollup(Date.now()), []);
    scheduler.stop();

    const names = await collectionNames();
    for (const name of VISIT_COLLECTIONS) assert.ok(!names.includes(name), `${name}가 생기면 안 된다`);
  });

  it('원본 이벤트가 없어도 대시보드는 기존 형식 그대로 0을 표시하고, 컬렉션을 만들지 않는다', async () => {
    const { data } = (await admin.get('/api/v1/admin/stats/visits').expect(200)).body;
    assert.equal(data.daily.length, 7);
    assert.ok(data.daily.every((day) => day.pageviews === 0 && day.uniqueVisitors === 0));
    assert.deepEqual(data.summary, { pageviews: 0, dailyUniqueVisitorsSum: 0, avgDailyUniqueVisitors: 0 });
    assert.deepEqual([data.topPaths, data.topReferrers], [[], []]);
    assert.deepEqual(data.devices, { desktop: 0, mobile: 0, tablet: 0, unknown: 0 });
    assert.deepEqual(data.dataQuality, { includesToday: true, approximateTopLists: false });

    const names = await collectionNames();
    for (const name of VISIT_COLLECTIONS) assert.ok(!names.includes(name), `${name}가 생기면 안 된다`);
  });

  it('첫 이벤트가 생기면 그 날짜부터 마감일까지 집계하고, 이후 방문이 없는 날은 0으로 채운다', async () => {
    const firstDay = daysAgo(4);
    await VisitEvent.collection.insertOne(eventOn(firstDay));

    const scheduler = startSchedulerOnce();
    await scheduler.ready;
    scheduler.stop();

    const now = Date.now();
    const docs = await VisitDailyStat.find().sort({ dateKey: 1 }).lean();
    assert.equal(docs[0].dateKey, firstDay, '최초 이벤트 날짜부터');
    assert.equal(docs.at(-1).dateKey, lastFinalizedDateKey(now));
    assert.equal(docs.length, daysBetween(firstDay, lastFinalizedDateKey(now)) + 1);
    assert.equal(docs[0].pageviews, 1);
    assert.ok(docs.slice(1).every((doc) => doc.pageviews === 0 && doc.uniqueVisitors === 0), '이후 빈 날은 0');
    assert.equal(await VisitDailyStat.countDocuments({ dateKey: daysAgo(5) }), 0, '최초 이벤트 이전은 저장 안 함');

    const { data } = (await admin.get('/api/v1/admin/stats/visits').expect(200)).body;
    assert.equal(data.daily.find((day) => day.date === firstDay).pageviews, 1, '대시보드 집계 규칙 유지');
  });

  it('가장 이른 이벤트가 보관 기간보다 오래되면(TTL 인덱스 미적용) 보관 기간 시작일부터 집계한다', async () => {
    const now = Date.now();
    await VisitEvent.collection.insertMany([eventOn(daysAgo(120), 'old'), eventOn(daysAgo(3), 'recent')]);

    const filled = await runRollup(now);
    assert.equal(filled[0], rawRetentionStartKey(now));
    assert.equal(await VisitDailyStat.countDocuments({ dateKey: daysAgo(120) }), 0);
    assert.equal(await VisitDailyStat.countDocuments({ dateKey: addDays(rawRetentionStartKey(now), -1) }), 0);
  });
});
