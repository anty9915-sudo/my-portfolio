import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { Admin } from '../../src/modules/auth/admin.model.js';
import { AdminSetupError, createAdmin } from '../../src/modules/auth/createAdmin.js';
import { TEST_ORIGIN, testAppConfig } from '../helpers/config.js';

const SETUP_TIMEOUT_MS = 180_000;
const PASSWORD = `pw-${randomBytes(12).toString('hex')}`;

describe('createAdmin (관리자 생성 스크립트의 핵심 로직)', () => {
  let mongod;

  before(
    async () => {
      mongod = await MongoMemoryServer.create();
      // 서버와 같은 설정: 자동 인덱스·컬렉션 생성 끔 → 인덱스는 createAdmin이 명시적으로 만든다
      await connectDatabase(mongod.getUri('portfolio_test'), { autoIndex: false, autoCreate: false });
    },
    { timeout: SETUP_TIMEOUT_MS },
  );

  after(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('서버 설정으로 앱을 만들고 요청을 처리해도 컬렉션·인덱스를 만들지 않는다', async () => {
    const app = createApp(testAppConfig, { logger: { error() {} } });
    await request(app).get('/api/v1/health').expect(200);
    await request(app).get('/api/v1/auth/me').expect(401);
    await request(app).post('/api/v1/auth/logout').set('Origin', TEST_ORIGIN).expect(204);
    const collections = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name);
    assert.deepEqual(collections, []);
  });

  it('정책에 맞지 않는 입력은 DB를 건드리기 전에 거부하고, 오류에 비밀번호를 담지 않는다', async () => {
    await assert.rejects(createAdmin({ email: 'not-an-email', password: PASSWORD }), AdminSetupError);
    await assert.rejects(createAdmin({ email: 'admin@example.com', password: 'short' }), (error) => {
      assert.ok(error instanceof AdminSetupError);
      assert.ok(!error.message.includes('short'));
      return true;
    });
    const collections = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name);
    assert.deepEqual(collections, [], '아무 컬렉션도 만들지 않아야 한다');
  });

  it('인덱스를 만들고 Argon2id 해시로 관리자 1명을 만든다 (이메일 정규화)', async () => {
    const created = await createAdmin({ email: '  Admin@Example.COM ', password: PASSWORD });
    assert.equal(created.email, 'admin@example.com');

    const admin = await Admin.findById(created.id).select('+passwordHash');
    assert.match(admin.passwordHash, /^\$argon2id\$v=19\$/);
    assert.ok(!admin.passwordHash.includes(PASSWORD));
    assert.equal(admin.role, 'admin');
    assert.equal(admin.failedLoginCount, 0);

    const adminIndexes = await mongoose.connection.collection('admins').indexes();
    const emailIndex = adminIndexes.find((index) => index.name === 'email_unique');
    assert.ok(emailIndex?.unique, 'admins.email_unique');

    const sessionIndexes = await mongoose.connection.collection('sessions').indexes();
    const ttl = sessionIndexes.find((index) => index.name === 'sessions_ttl');
    assert.equal(ttl?.expireAfterSeconds, 0, 'sessions.sessions_ttl');
  });

  it('관리자가 이미 있으면 아무것도 바꾸지 않고 거부한다', async () => {
    await assert.rejects(createAdmin({ email: 'second@example.com', password: PASSWORD }), /이미 있습니다/);
    assert.equal(await Admin.countDocuments(), 1);
  });
});
