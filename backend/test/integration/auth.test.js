import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, SESSIONS_COLLECTION } from '../../src/config/session.js';
import { Admin } from '../../src/modules/auth/admin.model.js';
import { LOCK_DURATION_MS, MAX_FAILED_ATTEMPTS } from '../../src/modules/auth/auth.service.js';
import { createAdmin } from '../../src/modules/auth/createAdmin.js';
import { TEST_ORIGIN, testAppConfig } from '../helpers/config.js';

const SETUP_TIMEOUT_MS = 180_000;
const EMAIL = 'admin@example.com';
// 테스트 실행마다 새로 만드는 값 (코드에 비밀번호를 하드코딩하지 않음)
const PASSWORD = `pw-${randomBytes(12).toString('hex')}`;
const NEW_PASSWORD = `new-${randomBytes(12).toString('hex')}`;

const silentLogger = { error() {} };
const sessions = () => mongoose.connection.collection(SESSIONS_COLLECTION);

/** 테스트마다 새 앱(= 새 로그인 빈도 제한 카운터)을 만든다. */
function makeApp(overrides = {}) {
  return createApp({ ...testAppConfig, ...overrides }, { logger: silentLogger });
}

function login(agent, body = { email: EMAIL, password: PASSWORD }) {
  return agent.post('/api/v1/auth/login').set('Origin', TEST_ORIGIN).send(body);
}

function sessionCookie(res, name = 'sid') {
  return (res.headers['set-cookie'] ?? []).find((cookie) => cookie.startsWith(`${name}=`));
}

describe('관리자 인증·세션 (MongoDB 메모리 서버)', () => {
  let mongod;
  let originalHash;
  let app;

  before(
    async () => {
      mongod = await MongoMemoryServer.create();
      await connectDatabase(mongod.getUri('portfolio_test'));
      await createAdmin({ email: EMAIL, password: PASSWORD });
      originalHash = (await Admin.findOne({ email: EMAIL }).select('+passwordHash')).passwordHash;
    },
    { timeout: SETUP_TIMEOUT_MS },
  );

  after(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  beforeEach(async () => {
    // 관리자 상태와 세션을 초기화한다 (해시를 다시 계산하지 않도록 원래 해시를 복원)
    await Admin.updateOne(
      { email: EMAIL },
      {
        $set: {
          passwordHash: originalHash,
          failedLoginCount: 0,
          lockUntil: null,
          lastLoginAt: null,
          passwordChangedAt: null,
        },
      },
    );
    await sessions().deleteMany({});
    app = makeApp();
  });

  describe('POST /auth/login', () => {
    it('성공하면 200, 관리자 id·email만 반환하고 HttpOnly·SameSite=Lax 세션 쿠키를 발급한다', async () => {
      const res = await login(request(app)).expect(200);
      assert.deepEqual(Object.keys(res.body.data.admin).sort(), ['email', 'id']);
      assert.equal(res.body.data.admin.email, EMAIL);
      assert.ok(!JSON.stringify(res.body).includes('passwordHash'));

      const cookie = sessionCookie(res);
      assert.ok(cookie, 'sid 쿠키가 있어야 한다');
      assert.match(cookie, /; HttpOnly/);
      assert.match(cookie, /; SameSite=Lax/);
      assert.match(cookie, /; Path=\//);
      assert.doesNotMatch(cookie, /; Secure/); // 개발·테스트 환경
      const expires = Date.parse(cookie.match(/Expires=([^;]+)/)[1]);
      assert.ok(Math.abs(expires - (Date.now() + SESSION_IDLE_MS)) < 60_000, '유휴 만료 2시간');
    });

    it('세션은 MongoDB에 저장되고 adminId·loginAt 외의 인증 정보는 담지 않는다', async () => {
      const res = await login(request(app)).expect(200);
      const docs = await sessions().find({}).toArray();
      assert.equal(docs.length, 1);
      const { session, expires } = docs[0];
      assert.deepEqual(Object.keys(session).sort(), ['adminId', 'cookie', 'loginAt']);
      assert.equal(session.adminId, res.body.data.admin.id);
      assert.equal(typeof session.loginAt, 'number');
      assert.ok(expires instanceof Date);
    });

    it('성공하면 lastLoginAt을 기록하고 실패 횟수를 초기화한다', async () => {
      await Admin.updateOne({ email: EMAIL }, { $set: { failedLoginCount: 3 } });
      await login(request(app)).expect(200);
      const admin = await Admin.findOne({ email: EMAIL });
      assert.equal(admin.failedLoginCount, 0);
      assert.ok(admin.lastLoginAt instanceof Date);
    });

    it('비밀번호가 틀리면 401 INVALID_CREDENTIALS', async () => {
      const res = await login(request(app), { email: EMAIL, password: 'wrong-password-123' }).expect(401);
      assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
      assert.equal(sessionCookie(res), undefined);
    });

    it('없는 이메일도 같은 401·같은 메시지 (계정 존재 여부 비노출)', async () => {
      const wrongPassword = await login(request(app), { email: EMAIL, password: 'wrong-password-123' });
      const unknownEmail = await login(request(app), { email: 'nobody@example.com', password: PASSWORD });
      assert.equal(unknownEmail.status, 401);
      assert.deepEqual(
        { code: unknownEmail.body.error.code, message: unknownEmail.body.error.message },
        { code: wrongPassword.body.error.code, message: wrongPassword.body.error.message },
      );
    });

    it('이메일 대소문자·앞뒤 공백은 정규화한다', async () => {
      await login(request(app), { email: '  ADMIN@Example.com ', password: PASSWORD }).expect(200);
    });

    it('정의되지 않은 필드·형식 오류는 400이고 응답에 비밀번호를 담지 않는다', async () => {
      const res = await login(request(app), { email: EMAIL, password: PASSWORD, role: 'admin' }).expect(400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.ok(!JSON.stringify(res.body).includes(PASSWORD));
      await login(request(app), { email: 'not-an-email', password: PASSWORD }).expect(400);
      await login(request(app), { email: EMAIL }).expect(400);
    });

    it('Origin 헤더가 없으면 403 (CSRF 방어)', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD }).expect(403);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });

    it('다른 출처의 Origin이면 403', async () => {
      await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', 'https://evil.example')
        .send({ email: EMAIL, password: PASSWORD })
        .expect(403);
    });

    it('다시 로그인하면 세션 ID를 재발급하고 이전 세션은 무효가 된다 (세션 고정 방지)', async () => {
      const agent = request.agent(app);
      const first = sessionCookie(await login(agent).expect(200)).split(';')[0];
      const second = sessionCookie(await login(agent).expect(200)).split(';')[0];
      assert.notEqual(first, second);
      await request(app).get('/api/v1/auth/me').set('Cookie', first).expect(401);
      await request(app).get('/api/v1/auth/me').set('Cookie', second).expect(200);
      assert.equal(await sessions().countDocuments(), 1);
    });
  });

  describe('로그인 시도 제한', () => {
    it(`연속 ${MAX_FAILED_ATTEMPTS}회 실패하면 계정을 15분 잠그고, 잠금 중에는 올바른 비밀번호도 429`, async () => {
      for (let i = 1; i <= MAX_FAILED_ATTEMPTS; i += 1) {
        await login(request(app), { email: EMAIL, password: `wrong-password-${i}` }).expect(401);
      }
      const locked = await Admin.findOne({ email: EMAIL });
      assert.ok(locked.lockUntil.getTime() > Date.now());
      assert.equal(locked.failedLoginCount, 0);

      const res = await login(request(app)).expect(429);
      assert.equal(res.body.error.code, 'TOO_MANY_ATTEMPTS');
      const retryAfter = Number(res.headers['retry-after']);
      assert.ok(retryAfter > 0 && retryAfter <= LOCK_DURATION_MS / 1000);
    });

    it('잠금 시간이 지나면 다시 로그인할 수 있다', async () => {
      await Admin.updateOne({ email: EMAIL }, { $set: { lockUntil: new Date(Date.now() - 1000) } });
      await login(request(app)).expect(200);
      assert.equal((await Admin.findOne({ email: EMAIL })).lockUntil, null);
    });

    it('같은 IP에서 15분에 10회를 넘으면 429 RATE_LIMITED + Retry-After', async () => {
      for (let i = 0; i < 10; i += 1) {
        await login(request(app), {}).expect(400); // 검증 실패도 시도 횟수에 포함
      }
      const res = await login(request(app)).expect(429);
      assert.equal(res.body.error.code, 'RATE_LIMITED');
      assert.ok(Number(res.headers['retry-after']) > 0);
      assert.ok(res.headers.ratelimit || res.headers['ratelimit-policy'], '표준 RateLimit 헤더');
    });
  });

  describe('GET /auth/me', () => {
    it('세션이 없으면 401 UNAUTHENTICATED', async () => {
      const res = await request(app).get('/api/v1/auth/me').expect(401);
      assert.equal(res.body.error.code, 'UNAUTHENTICATED');
    });

    it('로그인 상태면 id·email·role·lastLoginAt만 반환하고 쿠키 만료를 연장한다', async () => {
      const agent = request.agent(app);
      await login(agent).expect(200);
      const res = await agent.get('/api/v1/auth/me').expect(200);
      assert.deepEqual(Object.keys(res.body.data).sort(), ['email', 'id', 'lastLoginAt', 'role']);
      assert.equal(res.body.data.role, 'admin');
      assert.ok(sessionCookie(res), 'rolling: 요청마다 쿠키를 다시 발급');
    });

    it('유휴 만료(저장소의 expires 경과)된 세션은 401', async () => {
      const agent = request.agent(app);
      await login(agent).expect(200);
      await sessions().updateMany({}, { $set: { expires: new Date(Date.now() - 1000) } });
      await agent.get('/api/v1/auth/me').expect(401);
    });

    it('로그인 후 12시간이 지나면(절대 만료) 401이고 세션을 삭제한다', async () => {
      const agent = request.agent(app);
      await login(agent).expect(200);
      await sessions().updateMany({}, { $set: { 'session.loginAt': Date.now() - SESSION_ABSOLUTE_MS - 1000 } });
      await agent.get('/api/v1/auth/me').expect(401);
      assert.equal(await sessions().countDocuments(), 0);
    });

    it('비밀번호가 바뀐 시각 이전에 만든 세션은 401', async () => {
      const agent = request.agent(app);
      await login(agent).expect(200);
      await Admin.updateOne({ email: EMAIL }, { $set: { passwordChangedAt: new Date(Date.now() + 1000) } });
      await agent.get('/api/v1/auth/me').expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('세션을 삭제하고 204, 이후 /auth/me는 401', async () => {
      const agent = request.agent(app);
      await login(agent).expect(200);
      const res = await agent.post('/api/v1/auth/logout').set('Origin', TEST_ORIGIN).expect(204);
      assert.match(sessionCookie(res), /Expires=Thu, 01 Jan 1970/);
      assert.equal(await sessions().countDocuments(), 0);
      await agent.get('/api/v1/auth/me').expect(401);
    });

    it('세션이 없어도 204 (멱등)', async () => {
      await request(app).post('/api/v1/auth/logout').set('Origin', TEST_ORIGIN).expect(204);
    });

    it('Origin이 없으면 403이고 세션은 유지된다', async () => {
      const agent = request.agent(app);
      await login(agent).expect(200);
      await agent.post('/api/v1/auth/logout').expect(403);
      await agent.get('/api/v1/auth/me').expect(200);
    });
  });

  describe('PATCH /auth/password', () => {
    function changePassword(agent, body) {
      return agent.patch('/api/v1/auth/password').set('Origin', TEST_ORIGIN).send(body);
    }

    it('로그인하지 않으면 401', async () => {
      await changePassword(request(app), { currentPassword: PASSWORD, newPassword: NEW_PASSWORD }).expect(401);
    });

    it('현재 세션은 유지하고 다른 세션은 모두 삭제하며, 새 비밀번호로만 로그인된다', async () => {
      const current = request.agent(app);
      const other = request.agent(app);
      await login(current).expect(200);
      await login(other).expect(200);
      assert.equal(await sessions().countDocuments(), 2);

      await changePassword(current, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD }).expect(204);

      await current.get('/api/v1/auth/me').expect(200);
      await other.get('/api/v1/auth/me').expect(401);
      assert.equal(await sessions().countDocuments(), 1);

      const admin = await Admin.findOne({ email: EMAIL }).select('+passwordHash');
      assert.ok(admin.passwordChangedAt instanceof Date);
      assert.match(admin.passwordHash, /^\$argon2id\$/);

      const fresh = makeApp();
      await login(request(fresh), { email: EMAIL, password: PASSWORD }).expect(401);
      await login(request(fresh), { email: EMAIL, password: NEW_PASSWORD }).expect(200);
    });

    it('현재 비밀번호가 틀리면 401이고 로그인 실패 횟수에 포함된다', async () => {
      const agent = request.agent(app);
      await login(agent).expect(200);
      const res = await changePassword(agent, { currentPassword: 'wrong-password-123', newPassword: NEW_PASSWORD }).expect(401);
      assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
      assert.equal((await Admin.findOne({ email: EMAIL })).failedLoginCount, 1);
      await agent.get('/api/v1/auth/me').expect(200); // 세션은 그대로
    });

    it('새 비밀번호 정책(12~128자, 현재와 달라야 함)을 지키지 않으면 400', async () => {
      const agent = request.agent(app);
      await login(agent).expect(200);
      await changePassword(agent, { currentPassword: PASSWORD, newPassword: 'short' }).expect(400);
      await changePassword(agent, { currentPassword: PASSWORD, newPassword: PASSWORD }).expect(400);
      await changePassword(agent, { currentPassword: PASSWORD, newPassword: 'x'.repeat(129) }).expect(400);
    });

    it('Origin이 없으면 403', async () => {
      const agent = request.agent(app);
      await login(agent).expect(200);
      await agent.patch('/api/v1/auth/password').send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD }).expect(403);
    });
  });

  describe('운영 환경 쿠키', () => {
    it('운영에서는 __Host-sid 이름과 Secure 속성을 쓴다 (HTTPS 프록시 뒤)', async () => {
      const prodApp = makeApp({ isProduction: true, trustProxy: 1 });
      const res = await request(prodApp)
        .post('/api/v1/auth/login')
        .set('Origin', TEST_ORIGIN)
        .set('X-Forwarded-Proto', 'https')
        .send({ email: EMAIL, password: PASSWORD })
        .expect(200);
      const cookie = sessionCookie(res, '__Host-sid');
      assert.ok(cookie, '__Host-sid 쿠키가 있어야 한다');
      assert.match(cookie, /; Secure/);
      assert.match(cookie, /; HttpOnly/);
      assert.match(cookie, /; SameSite=Lax/);
      assert.match(cookie, /; Path=\//);
      assert.doesNotMatch(cookie, /Domain=/);
    });
  });
});
