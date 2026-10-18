import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { createMissingIndexes, getIndexDefinitions, planIndexes } from '../../src/config/indexes.js';

const SETUP_TIMEOUT_MS = 180_000;
const EXPECTED = [
  'admins.email_unique',
  'profiles.singletonKey_unique',
  'skills.slug_unique',
  'skills.name_unique_ci',
  'skills.skills_public_list',
  'projects.slug_unique',
  'projects.projects_public_list',
  'projects.projects_skillIds',
  'study_records.slug_unique',
  'study_records.study_records_public_list',
  'study_records.study_records_skillIds',
  'study_records.study_records_projectIds',
  'inquiries.inquiries_status_createdAt',
  'inquiries.inquiries_createdAt',
  'inquiries.inquiries_contentHash',
  'inquiries.inquiries_ttl',
  'visit_events.dedupKey_unique',
  'visit_events.visit_events_ttl',
  'visit_events.visit_events_dateKey_path',
  'visit_events.visit_events_dateKey_visitor',
  'visit_daily_stats.dateKey_unique',
  'sessions.sessions_ttl',
];

const names = (plan, state) =>
  plan.filter((item) => !state || item.state === state).map((item) => `${item.collection}.${item.name}`);

describe('인덱스 동기화 (scripts/sync-indexes.js의 핵심 로직)', () => {
  let mongod;
  let client;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    // 서버와 같은 설정: 자동 인덱스·컬렉션 생성 끔
    await connectDatabase(mongod.getUri('portfolio_test'), { autoIndex: false, autoCreate: false });
    client = mongoose.connection.getClient();
  }, { timeout: SETUP_TIMEOUT_MS });

  after(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('정의는 DATABASE.md 6.3의 22개와 일치한다', () => {
    assert.deepEqual(names(getIndexDefinitions().map((definition) => ({ ...definition }))), EXPECTED);
  });

  it('빈 DB: 계획 확인은 아무것도 만들지 않고, 생성은 22개를 한 번만 만든다', async () => {
    const db = client.db('fresh_db');
    const plan = await planIndexes(db);
    assert.deepEqual(names(plan, 'missing'), EXPECTED);
    assert.deepEqual(await db.listCollections().toArray(), [], '계획 확인(dry-run)은 읽기 전용');

    assert.deepEqual(await createMissingIndexes(db, plan), EXPECTED);
    const after = await planIndexes(db);
    assert.deepEqual(names(after, 'exists'), EXPECTED);
    assert.deepEqual(await createMissingIndexes(db, after), [], '두 번째 실행은 변경 없음');

    const skillIndexes = await db.collection('skills').indexes();
    const nameIndex = skillIndexes.find((index) => index.name === 'name_unique_ci');
    assert.equal(nameIndex.unique, true);
    assert.equal(nameIndex.collation.strength, 2);
    const ttl = (await db.collection('sessions').indexes()).find((index) => index.name === 'sessions_ttl');
    assert.equal(ttl.expireAfterSeconds, 0);
  });

  it('기존 인덱스는 삭제·변경하지 않는다: 충돌은 보고만, 다른 이름의 같은 정의는 그대로 둔다', async () => {
    const db = client.db('existing_db');
    await db.collection('skills').createIndex({ slug: 1 }, { name: 'slug_unique' }); // unique 아님 → 충돌
    await db.collection('projects').createIndex({ slug: 1 }, { name: 'slug_1', unique: true }); // 같은 정의, 다른 이름
    await db.collection('study_records').createIndex({ title: 1 }, { name: 'custom_title' }); // 정의에 없는 인덱스

    const plan = await planIndexes(db);
    const stateOf = (name) => plan.find((item) => `${item.collection}.${item.name}` === name).state;
    assert.equal(stateOf('skills.slug_unique'), 'conflict');
    assert.equal(stateOf('projects.slug_unique'), 'exists-other-name');

    const created = await createMissingIndexes(db, plan);
    assert.ok(!created.includes('skills.slug_unique'));
    assert.ok(!created.includes('projects.slug_unique'));

    const skillSlug = (await db.collection('skills').indexes()).find((index) => index.name === 'slug_unique');
    assert.equal(skillSlug.unique, undefined, '충돌 인덱스를 고치지 않음');
    const projectNames = (await db.collection('projects').indexes()).map((index) => index.name);
    assert.ok(projectNames.includes('slug_1') && !projectNames.includes('slug_unique'));
    const recordNames = (await db.collection('study_records').indexes()).map((index) => index.name);
    assert.ok(recordNames.includes('custom_title'), '정의에 없는 기존 인덱스를 삭제하지 않음');
  });
});
