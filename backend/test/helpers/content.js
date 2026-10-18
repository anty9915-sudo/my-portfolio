import { randomBytes } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { createAdmin } from '../../src/modules/auth/createAdmin.js';
import { Project } from '../../src/modules/projects/project.model.js';
import { Skill } from '../../src/modules/skills/skill.model.js';
import { StudyRecord } from '../../src/modules/study-records/studyRecord.model.js';
import { TEST_ORIGIN, testAppConfig } from './config.js';

// 3단계 CRUD 통합 테스트 공통 준비: 메모리 MongoDB + 관리자 + 로그인된 agent

export const SETUP_TIMEOUT_MS = 180_000;
export const silentLogger = { error() {} };
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = `pw-${randomBytes(12).toString('hex')}`;

export async function startContentTestEnv() {
  const mongod = await MongoMemoryServer.create();
  // autoIndex 기본값(true): 테스트 DB에는 스키마 인덱스(unique 포함)를 만들어 둔다
  await connectDatabase(mongod.getUri('portfolio_test'));
  await Promise.all([Skill.init(), Project.init(), StudyRecord.init()]);
  await createAdmin({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

  const app = createApp(testAppConfig, { logger: silentLogger });
  const agent = request.agent(app);
  await agent
    .post('/api/v1/auth/login')
    .set('Origin', TEST_ORIGIN)
    .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    .expect(200);

  return {
    app,
    agent,
    admin: adminClient(agent),
    publicGet: (path) => request(app).get(`/api/v1${path}`),
    anonymous: adminClient(request(app)),
    async reset() {
      await Promise.all([Skill.deleteMany({}), Project.deleteMany({}), StudyRecord.deleteMany({})]);
    },
    async stop() {
      await disconnectDatabase();
      await mongod.stop();
    },
  };
}

/** /api/v1/admin 요청. 비-GET에는 Origin을 붙인다. */
export function adminClient(agent) {
  const url = (path) => `/api/v1/admin${path}`;
  return {
    get: (path) => agent.get(url(path)),
    post: (path, body) => agent.post(url(path)).set('Origin', TEST_ORIGIN).send(body),
    patch: (path, body) => agent.patch(url(path)).set('Origin', TEST_ORIGIN).send(body),
    delete: (path) => agent.delete(url(path)).set('Origin', TEST_ORIGIN),
  };
}

let counter = 0;
const next = () => {
  counter += 1;
  return counter;
};

export function skillBody(overrides = {}) {
  const n = next();
  return { name: `Skill ${n}`, slug: `skill-${n}`, category: 'backend', status: 'learning', ...overrides };
}

export function projectBody(overrides = {}) {
  const n = next();
  return {
    title: `프로젝트 ${n}`,
    slug: `project-${n}`,
    summary: '요약',
    description: '## 개요\n본문',
    startedAt: '2026-01-01',
    ...overrides,
  };
}

export function studyRecordBody(overrides = {}) {
  const n = next();
  return {
    title: `학습 기록 ${n}`,
    slug: `record-${n}`,
    category: 'study',
    content: '# 정리\n내용',
    learnedAt: '2026-03-01',
    ...overrides,
  };
}

export const MISSING_ID = '0123456789abcdef01234567';
