import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import {
  booleanParam,
  buildSort,
  dateParam,
  dateRangeFilter,
  escapeRegex,
  kstDayStart,
  listQuerySchema,
  searchFilter,
  searchParam,
  sortParam,
  tagParam,
} from '../../src/utils/listQuery.js';

const parse = (schema, value) => z.strictObject({ v: schema }).safeParse({ v: value });

describe('escapeRegex', () => {
  it('정규식 특수문자를 모두 이스케이프해 글자 그대로 일치시킨다', () => {
    for (const text of ['.*', 'a+b', '(basic', '[x]', '^start$', 'c++', 'a|b', '{1,2}', 'back\\slash', '?']) {
      const regex = new RegExp(escapeRegex(text));
      assert.equal(regex.test(text), true, text);
    }
    assert.equal(new RegExp(escapeRegex('.*')).test('anything'), false);
    assert.equal(new RegExp(escapeRegex('C+'), 'i').test('C'), false);
    assert.equal(new RegExp(escapeRegex('C+'), 'i').test('c++'), true);
  });
});

describe('쿼리 파라미터 필드', () => {
  it('searchParam: 앞뒤 공백 제거 후 2~50자, 문자열 하나만', () => {
    assert.equal(parse(searchParam(), '  리액트  ').data.v, '리액트');
    for (const bad of ['a', '   ', 'x'.repeat(51), ['ab', 'cd']]) {
      assert.equal(parse(searchParam(), bad).success, false, JSON.stringify(bad));
    }
  });

  it('booleanParam: "true"/"false"만', () => {
    assert.equal(parse(booleanParam(), 'true').data.v, true);
    assert.equal(parse(booleanParam(), 'false').data.v, false);
    for (const bad of ['TRUE', '1', 'yes', '', ['true', 'false']]) {
      assert.equal(parse(booleanParam(), bad).success, false, JSON.stringify(bad));
    }
  });

  it('tagParam: 소문자로 정규화, 형식 검사', () => {
    assert.equal(parse(tagParam(), ' API ').data.v, 'api');
    assert.equal(parse(tagParam(), 'two words').success, false);
  });

  it('dateParam: 실제 존재하는 YYYY-MM-DD만 (시각 포함 문자열 거부)', () => {
    assert.equal(parse(dateParam(), '2026-09-01').success, true);
    for (const bad of ['2026-02-30', '2026-9-1', '2026-09-01T00:00:00Z', 'today']) {
      assert.equal(parse(dateParam(), bad).success, false, bad);
    }
  });
});

describe('sortParam', () => {
  const sort = sortParam(['title', 'startedAt']);

  it('오름차순·내림차순과 최대 2개 필드', () => {
    assert.deepEqual(parse(sort, 'title').data.v, [{ field: 'title', direction: 1 }]);
    assert.deepEqual(parse(sort, '-startedAt,title').data.v, [
      { field: 'startedAt', direction: -1 },
      { field: 'title', direction: 1 },
    ]);
  });

  it('허용 목록 밖·3개 이상·같은 필드 반복·빈 항목·중복 파라미터는 거부', () => {
    for (const bad of ['createdAt', '_id', 'title,startedAt,title', 'title,-title', ',title', '', '--title', ['title', 'startedAt']]) {
      assert.equal(parse(sort, bad).success, false, JSON.stringify(bad));
    }
  });
});

describe('buildSort', () => {
  const defaultSort = { sortOrder: 1, startedAt: -1, _id: -1 };

  it('sort가 없으면 기본 정렬을 그대로 쓴다 (현재 방향 유지)', () => {
    assert.equal(buildSort(undefined, defaultSort), defaultSort);
  });

  it('sort가 있으면 _id를 마지막에 두고 마지막 필드의 방향을 따른다', () => {
    assert.deepEqual(Object.entries(buildSort([{ field: 'title', direction: 1 }], defaultSort)), [
      ['title', 1],
      ['_id', 1],
    ]);
    assert.deepEqual(
      Object.entries(buildSort([{ field: 'title', direction: 1 }, { field: 'startedAt', direction: -1 }], defaultSort)),
      [
        ['title', 1],
        ['startedAt', -1],
        ['_id', -1],
      ],
    );
  });
});

describe('listQuerySchema', () => {
  const schema = listQuerySchema({ q: searchParam(), from: dateParam(), to: dateParam() }, { sortFields: ['title'], dateRange: true });

  it('정의된 파라미터와 페이지네이션을 받는다', () => {
    const result = schema.parse({ q: 'ab', page: '2', limit: '5', sort: '-title', from: '2026-01-01', to: '2026-01-01' });
    assert.deepEqual(result.sort, [{ field: 'title', direction: -1 }]);
    assert.equal(result.page, 2);
  });

  it('정의되지 않은 파라미터·객체형 키·중복 값은 거부', () => {
    for (const query of [{ foo: '1' }, { 'q[$ne]': 'x' }, { q: ['ab', 'cd'] }, { page: ['1', '2'] }]) {
      assert.equal(schema.safeParse(query).success, false, JSON.stringify(query));
    }
  });

  it('from이 to보다 늦으면 거부 (같은 날은 허용)', () => {
    assert.equal(schema.safeParse({ from: '2026-02-01', to: '2026-01-31' }).success, false);
    assert.equal(schema.safeParse({ from: '2026-02-01', to: '2026-02-01' }).success, true);
  });

  it('paginated: false면 page·limit도 정의되지 않은 파라미터', () => {
    const noPaging = listQuerySchema({}, { paginated: false });
    assert.equal(noPaging.safeParse({ page: '1' }).success, false);
    assert.equal(noPaging.safeParse({ sort: 'title' }).success, false, 'sortFields가 없으면 sort도 거부');
  });
});

describe('검색·날짜 범위 필터', () => {
  it('searchFilter: 필드별 대소문자 무시 부분 일치를 $or로, 검색어는 이스케이프', () => {
    const filter = searchFilter('a.b', ['title', 'tags']);
    assert.equal(filter.$or.length, 2);
    assert.equal(filter.$or[0].title.$regex, 'a\\.b');
    assert.equal(filter.$or[0].title.$options, 'i');
    assert.deepEqual(searchFilter(undefined, ['title']), {});
  });

  it('kstDayStart: KST 00:00을 UTC로 변환', () => {
    assert.equal(kstDayStart('2026-09-01').toISOString(), '2026-08-31T15:00:00.000Z');
    assert.equal(kstDayStart('2026-01-01').toISOString(), '2025-12-31T15:00:00.000Z', '연도 경계');
  });

  it('dateRangeFilter: from은 KST 00:00 이상, to는 다음 날 KST 00:00 미만', () => {
    const range = dateRangeFilter('2026-09-01', '2026-09-30');
    assert.equal(range.$gte.toISOString(), '2026-08-31T15:00:00.000Z');
    assert.equal(range.$lt.toISOString(), '2026-09-30T15:00:00.000Z');
    assert.equal(dateRangeFilter('2026-12-31', undefined).$lt, undefined);
    assert.equal(dateRangeFilter(undefined, '2026-12-31').$lt.toISOString(), '2026-12-31T15:00:00.000Z');
    assert.equal(dateRangeFilter(undefined, undefined), undefined);
  });

  it('날짜만 저장한 값(UTC 자정 = KST 09:00)은 같은 KST 날짜 범위에 포함된다', () => {
    const stored = new Date('2026-09-01T00:00:00.000Z');
    const range = dateRangeFilter('2026-09-01', '2026-09-01');
    assert.ok(stored >= range.$gte && stored < range.$lt);
  });
});
