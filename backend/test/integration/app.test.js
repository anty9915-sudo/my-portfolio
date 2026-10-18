import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { createErrorHandler } from '../../src/middleware/errorHandler.js';
import { jsonBody } from '../../src/middleware/jsonBody.js';
import { requestId } from '../../src/middleware/requestId.js';
import { TEST_ORIGIN, testAppConfig } from '../helpers/config.js';

// 실제 Atlas가 아니라 로컬 메모리 MongoDB를 사용한다 (BACKEND_PLAN.md 1장).
// 첫 실행 시 mongodb-memory-server가 MongoDB 바이너리를 내려받으므로 시간이 걸릴 수 있다.
const SETUP_TIMEOUT_MS = 180_000;

describe('app (MongoDB 메모리 서버)', () => {
  let mongod;
  let app;

  before(
    async () => {
      mongod = await MongoMemoryServer.create();
      await connectDatabase(mongod.getUri('portfolio_test'));
      app = createApp(testAppConfig, { logger: { error() {} } });
    },
    { timeout: SETUP_TIMEOUT_MS },
  );

  after(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('mongoose 보안 설정이 켜져 있다', () => {
    assert.equal(mongoose.get('sanitizeFilter'), true);
    assert.equal(mongoose.get('strictQuery'), true);
  });

  describe('GET /api/v1/health', () => {
    it('DB가 연결되어 있으면 200', async () => {
      const res = await request(app).get('/api/v1/health').expect(200);
      assert.deepEqual(res.body, { success: true, data: { status: 'ok', database: 'up' } });
      assert.equal(res.headers['cache-control'], 'no-store');
    });

    it('DB가 끊겨 있으면 503 SERVICE_UNAVAILABLE', async () => {
      const downApp = createApp(testAppConfig, { isDbConnected: () => false });
      const res = await request(downApp).get('/api/v1/health').expect(503);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'SERVICE_UNAVAILABLE');
    });
  });

  describe('공통 헤더', () => {
    it('X-Request-Id를 붙이고 오류 응답의 requestId와 같다', async () => {
      const res = await request(app).get('/api/v1/does-not-exist').expect(404);
      assert.match(res.headers['x-request-id'], /^[0-9a-f]{8}$/);
      assert.equal(res.body.error.requestId, res.headers['x-request-id']);
    });

    it('helmet 보안 헤더가 있고 X-Powered-By가 없다', async () => {
      const res = await request(app).get('/api/v1/health');
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert.equal(res.headers['x-powered-by'], undefined);
    });

    it('CORS는 CLIENT_ORIGIN만 허용하고 자격 증명을 허용한다', async () => {
      const res = await request(app)
        .options('/api/v1/health')
        .set('Origin', TEST_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);
      assert.equal(res.headers['access-control-allow-origin'], TEST_ORIGIN);
      assert.equal(res.headers['access-control-allow-credentials'], 'true');
    });
  });

  describe('라우팅과 Origin 검증', () => {
    it('정의되지 않은 경로는 404 ROUTE_NOT_FOUND', async () => {
      const res = await request(app).get('/api/v1/nope').expect(404);
      assert.equal(res.body.error.code, 'ROUTE_NOT_FOUND');
    });

    it('Origin 없는 POST는 경로와 관계없이 403', async () => {
      const res = await request(app).post('/api/v1/health').send({}).expect(403);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });

    it('다른 Origin의 POST는 403', async () => {
      await request(app).post('/api/v1/health').set('Origin', 'https://evil.example').send({}).expect(403);
    });

    it('올바른 Origin이면 Origin 검증을 통과한다 (이 경로는 POST가 없어 404)', async () => {
      const res = await request(app).post('/api/v1/health').set('Origin', TEST_ORIGIN).send({}).expect(404);
      assert.equal(res.body.error.code, 'ROUTE_NOT_FOUND');
    });
  });
});

describe('jsonBody + errorHandler', () => {
  // 1단계에는 본문을 받는 엔드포인트가 없으므로 미들웨어만 연결한 앱으로 검증한다.
  const app = express();
  app.use(requestId);
  app.post('/echo', jsonBody({ limit: '16kb' }), (req, res) => res.json({ body: req.body }));
  app.use(createErrorHandler({ logger: { error() {} } }));

  it('JSON 본문을 파싱한다', async () => {
    const res = await request(app).post('/echo').send({ a: 1 }).expect(200);
    assert.deepEqual(res.body, { body: { a: 1 } });
  });

  it('16KB 초과 본문은 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await request(app)
      .post('/echo')
      .send({ text: 'x'.repeat(17 * 1024) })
      .expect(413);
    assert.equal(res.body.error.code, 'PAYLOAD_TOO_LARGE');
  });

  it('JSON이 아닌 본문은 415 UNSUPPORTED_MEDIA_TYPE', async () => {
    const res = await request(app).post('/echo').set('Content-Type', 'text/plain').send('hello').expect(415);
    assert.equal(res.body.error.code, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('깨진 JSON은 400 INVALID_JSON', async () => {
    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{"a":')
      .expect(400);
    assert.equal(res.body.error.code, 'INVALID_JSON');
  });
});
