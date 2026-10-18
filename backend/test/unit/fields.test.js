import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import {
  isHttpsUrl,
  isNotFutureDate,
  objectIdArray,
  optionalEmail,
  optionalHttpsUrl,
  optionalText,
  parseDateInput,
  slugField,
  tagsField,
  toPatchSchema,
} from '../../src/utils/fields.js';
import { buildPageMeta, paginationQuerySchema } from '../../src/utils/pagination.js';

const parse = (schema, value) => z.strictObject({ v: schema }).safeParse(value === undefined ? {} : { v: value });

describe('parseDateInput', () => {
  it('YYYY-MM-DD는 UTC 자정, 시간대 있는 ISO 날짜시각을 받는다', () => {
    assert.equal(parseDateInput('2026-09-01').toISOString(), '2026-09-01T00:00:00.000Z');
    assert.equal(parseDateInput('2026-09-01T09:00:00+09:00').toISOString(), '2026-09-01T00:00:00.000Z');
  });

  it('존재하지 않는 날짜·형식 오류·시간대 없는 시각은 null', () => {
    for (const value of ['2026-02-30', '2026-13-01', '2026-9-1', 'yesterday', '2026-09-01T09:00:00', 20260901, null]) {
      assert.equal(parseDateInput(value), null, String(value));
    }
  });
});

describe('isNotFutureDate', () => {
  const now = Date.parse('2026-10-15T16:00:00.000Z'); // KST 2026-10-16 01:00

  it('과거와 KST 기준 오늘 날짜는 허용', () => {
    assert.equal(isNotFutureDate(parseDateInput('2026-10-15'), now), true);
    assert.equal(isNotFutureDate(parseDateInput('2026-10-16'), now), true, 'KST 오늘');
  });

  it('KST 기준 내일 이후는 거부', () => {
    assert.equal(isNotFutureDate(parseDateInput('2026-10-17'), now), false);
  });
});

describe('isHttpsUrl', () => {
  it('https만 허용한다', () => {
    assert.equal(isHttpsUrl('https://github.com/example'), true);
    for (const value of ['http://example.com', 'javascript:alert(1)', 'data:text/html,x', 'ftp://x.com', 'github.com', '']) {
      assert.equal(isHttpsUrl(value), false, value);
    }
  });
});

describe('필드 스키마', () => {
  it('slugField는 소문자·숫자·하이픈과 길이를 검사한다', () => {
    const slug = slugField(3, 80);
    assert.equal(parse(slug, 'my-project-2').success, true);
    for (const bad of ['ab', 'My-Project', 'my_project', '-start', 'end-', 'double--dash', '한글']) {
      assert.equal(parse(slug, bad).success, false, bad);
    }
  });

  it('tagsField는 소문자로 바꾸고 중복을 제거하며 10개까지 허용한다', () => {
    assert.deepEqual(parse(tagsField(), [' API ', 'api', '웹-보안']).data.v, ['api', '웹-보안']);
    assert.equal(parse(tagsField(), ['bad tag']).success, false);
    assert.equal(parse(tagsField(), Array.from({ length: 11 }, (_, i) => `t${i}`)).success, false);
  });

  it('objectIdArray는 형식을 검사하고 소문자·중복 제거한다', () => {
    const id = '0123456789ABCDEF01234567';
    assert.deepEqual(parse(objectIdArray(5), [id, id.toLowerCase()]).data.v, [id.toLowerCase()]);
    assert.equal(parse(objectIdArray(5), ['not-an-id']).success, false);
    assert.equal(parse(objectIdArray(1), ['0123456789abcdef01234567', '0123456789abcdef01234568']).success, false);
  });

  it('optionalText·optionalHttpsUrl: 빈 문자열과 null은 null, 생략은 변경 없음', () => {
    assert.equal(parse(optionalText(10), '   ').data.v, null);
    assert.equal(parse(optionalText(10), null).data.v, null);
    assert.ok(!('v' in parse(optionalText(10)).data));
    assert.equal(parse(optionalHttpsUrl(), '').data.v, null);
    assert.equal(parse(optionalHttpsUrl(), 'http://x.com').success, false);
  });

  it('optionalEmail: 공백 제거·소문자, 빈 문자열·null은 null, 생략은 변경 없음, 형식 오류 거부', () => {
    assert.equal(parse(optionalEmail(), '  Me@Example.COM ').data.v, 'me@example.com');
    assert.equal(parse(optionalEmail(), '').data.v, null);
    assert.equal(parse(optionalEmail(), null).data.v, null);
    assert.ok(!('v' in parse(optionalEmail()).data));
    for (const bad of ['not-an-email', 'a@b', `${'x'.repeat(250)}@example.com`, 123]) {
      assert.equal(parse(optionalEmail(), bad).success, false, String(bad));
    }
  });

  it('toPatchSchema는 모든 필드를 선택으로 만들고, 빈 본문과 정의되지 않은 필드는 거부한다', () => {
    const patch = toPatchSchema({ title: z.string(), note: optionalText(10) });
    assert.equal(patch.safeParse({ note: null }).success, true);
    assert.equal(patch.safeParse({}).success, false);
    assert.equal(patch.safeParse({ title: 'x', id: '1' }).success, false);
    assert.equal(patch.safeParse({ title: null }).success, false, '필수 필드는 null 불가');
  });
});

describe('pagination', () => {
  it('buildPageMeta', () => {
    assert.deepEqual(buildPageMeta({ page: 1, limit: 10, totalItems: 0 }), {
      page: 1,
      limit: 10,
      totalItems: 0,
      totalPages: 0,
      hasNext: false,
    });
    assert.deepEqual(buildPageMeta({ page: 2, limit: 10, totalItems: 25 }), {
      page: 2,
      limit: 10,
      totalItems: 25,
      totalPages: 3,
      hasNext: true,
    });
  });

  it('paginationQuerySchema는 문자열 쿼리를 정수로 바꾸고 범위·정의되지 않은 파라미터를 검사한다', () => {
    assert.deepEqual(paginationQuerySchema.parse({ page: '2', limit: '50' }), { page: 2, limit: 50 });
    assert.deepEqual(paginationQuerySchema.parse({}), {});
    for (const query of [{ page: '0' }, { limit: '51' }, { page: 'x' }, { page: ['1', '2'] }, { q: 'a' }]) {
      assert.equal(paginationQuerySchema.safeParse(query).success, false, JSON.stringify(query));
    }
  });
});
