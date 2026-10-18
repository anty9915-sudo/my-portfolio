import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasBody, requireJsonContentType } from '../../src/middleware/contentType.js';
import { createErrorHandler } from '../../src/middleware/errorHandler.js';
import { notFound } from '../../src/middleware/notFound.js';
import { originCheck } from '../../src/middleware/originCheck.js';
import { requestId } from '../../src/middleware/requestId.js';
import { validateIdParam, validateSlugParam } from '../../src/middleware/params.js';
import { issuesToDetails, validate } from '../../src/middleware/validate.js';
import { ApiError } from '../../src/utils/ApiError.js';
import { fakeReq, fakeRes, spyNext } from '../helpers/fakes.js';
import { TEST_ORIGIN } from '../helpers/config.js';

describe('requestId', () => {
  it('8자리 16진수 ID를 req.id와 X-Request-Id에 설정한다', () => {
    const req = fakeReq({ headers: { 'x-request-id': 'injected' } });
    const res = fakeRes();
    const next = spyNext();
    requestId(req, res, next);
    assert.match(req.id, /^[0-9a-f]{8}$/);
    assert.equal(res.headers['x-request-id'], req.id);
    assert.deepEqual(next.calls, [undefined]);
  });
});

describe('originCheck', () => {
  const check = originCheck(TEST_ORIGIN);

  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    it(`${method}는 Origin 없이 통과한다`, () => {
      const next = spyNext();
      check(fakeReq({ method }), fakeRes(), next);
      assert.deepEqual(next.calls, [undefined]);
    });
  }

  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    it(`${method}는 일치하는 Origin이면 통과한다`, () => {
      const next = spyNext();
      check(fakeReq({ method, headers: { origin: TEST_ORIGIN } }), fakeRes(), next);
      assert.deepEqual(next.calls, [undefined]);
    });
  }

  it('Origin이 다르면 403 FORBIDDEN', () => {
    const next = spyNext();
    check(fakeReq({ method: 'POST', headers: { origin: 'https://evil.example' } }), fakeRes(), next);
    assert.equal(next.calls[0].status, 403);
    assert.equal(next.calls[0].code, 'FORBIDDEN');
  });

  it('Origin 헤더가 없으면 403 FORBIDDEN', () => {
    const next = spyNext();
    check(fakeReq({ method: 'DELETE' }), fakeRes(), next);
    assert.equal(next.calls[0].code, 'FORBIDDEN');
  });

  it('끝 슬래시가 붙은 Origin도 거부한다 (정확히 일치해야 함)', () => {
    const next = spyNext();
    check(fakeReq({ method: 'POST', headers: { origin: `${TEST_ORIGIN}/` } }), fakeRes(), next);
    assert.equal(next.calls[0].code, 'FORBIDDEN');
  });
});

describe('requireJsonContentType', () => {
  it('본문이 없으면 Content-Type을 검사하지 않는다', () => {
    const next = spyNext();
    requireJsonContentType(fakeReq({ method: 'POST', headers: { 'content-length': '0' } }), fakeRes(), next);
    assert.deepEqual(next.calls, [undefined]);
  });

  it('application/json; charset=utf-8을 허용한다', () => {
    const next = spyNext();
    const headers = { 'content-length': '2', 'content-type': 'Application/JSON; charset=utf-8' };
    requireJsonContentType(fakeReq({ method: 'POST', headers }), fakeRes(), next);
    assert.deepEqual(next.calls, [undefined]);
  });

  it('JSON이 아닌 본문은 415', () => {
    const next = spyNext();
    const headers = { 'content-length': '5', 'content-type': 'text/plain' };
    requireJsonContentType(fakeReq({ method: 'POST', headers }), fakeRes(), next);
    assert.equal(next.calls[0].status, 415);
  });

  it('Content-Type 없이 본문이 있으면 415', () => {
    const next = spyNext();
    requireJsonContentType(fakeReq({ method: 'POST', headers: { 'transfer-encoding': 'chunked' } }), fakeRes(), next);
    assert.equal(next.calls[0].code, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('hasBody는 content-length와 transfer-encoding으로 판단한다', () => {
    assert.equal(hasBody(fakeReq()), false);
    assert.equal(hasBody(fakeReq({ headers: { 'content-length': '0' } })), false);
    assert.equal(hasBody(fakeReq({ headers: { 'content-length': '10' } })), true);
    assert.equal(hasBody(fakeReq({ headers: { 'transfer-encoding': 'chunked' } })), true);
  });
});

describe('notFound', () => {
  it('404 ROUTE_NOT_FOUND를 넘긴다', () => {
    const next = spyNext();
    notFound(fakeReq(), fakeRes(), next);
    assert.equal(next.calls[0].status, 404);
    assert.equal(next.calls[0].code, 'ROUTE_NOT_FOUND');
  });
});

describe('errorHandler', () => {
  const silentLogger = { error() {} };

  function run(err, { logger = silentLogger, res = fakeRes() } = {}) {
    const handler = createErrorHandler({ logger });
    const next = spyNext();
    handler(err, fakeReq({ id: 'abcd1234', method: 'POST', path: '/x' }), res, next);
    return { res, next };
  }

  it('ApiError를 공통 오류 형식으로 변환한다', () => {
    const { res } = run(ApiError.validation([{ field: 'title', reason: '필수' }]));
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: '요청 값을 확인해 주세요.',
        details: [{ field: 'title', reason: '필수' }],
        requestId: 'abcd1234',
      },
    });
  });

  const bodyParserCases = [
    ['entity.parse.failed', 400, 'INVALID_JSON'],
    ['entity.too.large', 413, 'PAYLOAD_TOO_LARGE'],
    ['charset.unsupported', 415, 'UNSUPPORTED_MEDIA_TYPE'],
  ];
  for (const [type, status, code] of bodyParserCases) {
    it(`body-parser 오류 ${type} → ${status} ${code}`, () => {
      const { res } = run(Object.assign(new Error('raw'), { type }));
      assert.equal(res.statusCode, status);
      assert.equal(res.body.error.code, code);
    });
  }

  it('예상하지 못한 오류는 500으로 바꾸고 원문을 노출하지 않으며 로그에 남긴다', () => {
    const logged = [];
    const logger = { error: (...args) => logged.push(args) };
    const { res } = run(new Error('E11000 duplicate key mongodb://user:pw@host'), { logger });
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error.code, 'INTERNAL_ERROR');
    assert.ok(!JSON.stringify(res.body).includes('E11000'));
    assert.equal(res.body.error.stack, undefined);
    assert.equal(logged.length, 1);
  });

  it('MongoDB 중복 키 오류(E11000)는 409 DUPLICATE_KEY로 바꾸고 필드 이름만 알린다', () => {
    const mongoError = Object.assign(new Error('E11000 duplicate key ... { slug: "secret-value" }'), {
      code: 11000,
      keyPattern: { slug: 1 },
    });
    const { res } = run(mongoError);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error.code, 'DUPLICATE_KEY');
    assert.match(res.body.error.message, /slug/);
    assert.ok(!JSON.stringify(res.body).includes('secret-value'));
  });

  it('retryAfter가 있는 ApiError는 Retry-After 헤더를 붙인다', () => {
    const { res } = run(ApiError.tooManyAttempts(120));
    assert.equal(res.statusCode, 429);
    assert.equal(res.headers['retry-after'], '120');
    assert.equal(res.body.error.code, 'TOO_MANY_ATTEMPTS');
    assert.equal(run(ApiError.unauthenticated()).res.headers['retry-after'], undefined);
  });

  it('응답이 이미 전송되었으면 다음 오류 처리기로 넘긴다', () => {
    const res = fakeRes();
    res.headersSent = true;
    const err = new Error('late');
    const { next } = run(err, { res });
    assert.deepEqual(next.calls, [err]);
  });
});

describe('경로 매개변수 검증', () => {
  it('validateIdParam: ObjectId 형식이 아니면 400 INVALID_ID, 맞으면 소문자로 통과', () => {
    const bad = spyNext();
    validateIdParam(fakeReq({ params: { id: 'abc' } }), fakeRes(), bad);
    assert.equal(bad.calls[0].code, 'INVALID_ID');

    const req = fakeReq({ params: { id: '0123456789ABCDEF01234567' } });
    const good = spyNext();
    validateIdParam(req, fakeRes(), good);
    assert.deepEqual(good.calls, [undefined]);
    assert.equal(req.params.id, '0123456789abcdef01234567');
  });

  it('validateSlugParam: 형식이 맞지 않으면 404 NOT_FOUND', () => {
    for (const slug of ['Upper', 'a_b', 'x'.repeat(81)]) {
      const next = spyNext();
      validateSlugParam(fakeReq({ params: { slug } }), fakeRes(), next);
      assert.equal(next.calls[0].code, 'NOT_FOUND', slug);
    }
    const next = spyNext();
    validateSlugParam(fakeReq({ params: { slug: 'my-project' } }), fakeRes(), next);
    assert.deepEqual(next.calls, [undefined]);
  });
});

describe('issuesToDetails', () => {
  it('정의되지 않은 필드는 키 이름별로 알린다', () => {
    assert.deepEqual(issuesToDetails([{ code: 'unrecognized_keys', keys: ['id', 'foo'], path: [], message: 'x' }]), [
      { field: 'id', reason: '정의되지 않은 필드입니다.' },
      { field: 'foo', reason: '정의되지 않은 필드입니다.' },
    ]);
  });
});

describe('validate', () => {
  // Zod와 같은 safeParse 계약을 따르는 대역 스키마
  const schemaOk = (data) => ({ safeParse: () => ({ success: true, data }) });
  const schemaFail = (issues) => ({ safeParse: () => ({ success: false, error: { issues } }) });

  it('성공하면 검증된 값을 req.validated에 담는다', () => {
    const req = fakeReq({ body: { a: ' x ' }, query: {} });
    const next = spyNext();
    validate({ body: schemaOk({ a: 'x' }), query: schemaOk({ page: 1 }) })(req, fakeRes(), next);
    assert.deepEqual(req.validated, { body: { a: 'x' }, query: { page: 1 } });
    assert.deepEqual(next.calls, [undefined]);
  });

  it('실패하면 모든 부분의 오류를 details로 모아 400을 넘긴다', () => {
    const req = fakeReq({ body: {}, query: {} });
    const next = spyNext();
    validate({
      query: schemaFail([{ path: ['page'], message: '정수여야 합니다.' }]),
      body: schemaFail([
        { path: ['links', 0, 'url'], message: 'https URL만 허용됩니다.' },
        { path: [], message: '알 수 없는 필드' },
      ]),
    })(req, fakeRes(), next);
    const error = next.calls[0];
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.deepEqual(error.details, [
      { field: 'page', reason: '정수여야 합니다.' },
      { field: 'links.0.url', reason: 'https URL만 허용됩니다.' },
      { field: '(root)', reason: '알 수 없는 필드' },
    ]);
    assert.equal(req.validated, undefined);
  });
});
