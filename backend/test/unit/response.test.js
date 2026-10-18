import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiError } from '../../src/utils/ApiError.js';
import { buildErrorBody, sendList, sendSuccess } from '../../src/utils/response.js';
import { fakeRes } from '../helpers/fakes.js';

describe('response helpers', () => {
  it('sendSuccess는 기본 200과 { success, data }를 보낸다', () => {
    const res = fakeRes();
    sendSuccess(res, { id: '1' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true, data: { id: '1' } });
  });

  it('sendSuccess는 지정한 상태 코드를 쓴다', () => {
    const res = fakeRes();
    sendSuccess(res, { id: '1' }, 201);
    assert.equal(res.statusCode, 201);
  });

  it('sendList는 data와 meta를 함께 보낸다', () => {
    const res = fakeRes();
    const meta = { page: 1, limit: 10, totalItems: 0, totalPages: 0, hasNext: false };
    sendList(res, [], meta);
    assert.deepEqual(res.body, { success: true, data: [], meta });
  });

  it('buildErrorBody는 details가 없으면 생략한다', () => {
    const body = buildErrorBody({ code: 'NOT_FOUND', message: '없음', requestId: 'abcd1234' });
    assert.deepEqual(body, {
      success: false,
      error: { code: 'NOT_FOUND', message: '없음', requestId: 'abcd1234' },
    });
  });

  it('buildErrorBody는 details가 있으면 포함한다', () => {
    const details = [{ field: 'title', reason: '필수' }];
    const body = buildErrorBody({ code: 'VALIDATION_ERROR', message: 'x', details });
    assert.deepEqual(body.error.details, details);
  });
});

describe('ApiError', () => {
  it('상태·코드·메시지·상세를 담는다', () => {
    const error = ApiError.validation([{ field: 'a', reason: 'b' }]);
    assert.ok(error instanceof Error);
    assert.equal(error.status, 400);
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.deepEqual(error.details, [{ field: 'a', reason: 'b' }]);
  });

  it('팩토리 메서드가 API.md 3장의 코드와 일치한다', () => {
    assert.deepEqual(
      [ApiError.forbidden(), ApiError.routeNotFound(), ApiError.unsupportedMediaType(), ApiError.serviceUnavailable()].map(
        (e) => [e.status, e.code],
      ),
      [
        [403, 'FORBIDDEN'],
        [404, 'ROUTE_NOT_FOUND'],
        [415, 'UNSUPPORTED_MEDIA_TYPE'],
        [503, 'SERVICE_UNAVAILABLE'],
      ],
    );
  });
});
