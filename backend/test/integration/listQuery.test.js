import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  projectBody,
  SETUP_TIMEOUT_MS,
  skillBody,
  startContentTestEnv,
  studyRecordBody,
} from '../helpers/content.js';

// 4단계: 검색·필터·정렬 (API.md 5장)

describe('목록 검색·필터·정렬', () => {
  let env;

  before(async () => {
    env = await startContentTestEnv();
  }, { timeout: SETUP_TIMEOUT_MS });

  after(async () => env?.stop());
  beforeEach(async () => env.reset());

  const create = async (path, body) => (await env.admin.post(path, body).expect(201)).body.data;
  const slugsOf = (res) => res.body.data.map((item) => item.slug);
  const idsOf = (res) => res.body.data.map((item) => item.id);
  const ascending = (ids) => [...ids].sort();
  const descending = (ids) => [...ids].sort().reverse();

  describe('프로젝트', () => {
    it('q: 제목·요약·태그에서 대소문자 무시 부분 일치 (한글 포함)', async () => {
      await create('/projects', projectBody({ slug: 'by-title', title: 'Portfolio API', visibility: 'public' }));
      await create('/projects', projectBody({ slug: 'by-summary', summary: '웹 보안 실습 기록', visibility: 'public' }));
      await create('/projects', projectBody({ slug: 'by-tag', tags: ['portfolio'], visibility: 'public' }));
      await create('/projects', projectBody({ slug: 'unrelated', title: 'Other', visibility: 'public' }));

      assert.deepEqual(slugsOf(await env.publicGet('/projects?q=PORTFOLIO&sort=title').expect(200)).sort(), [
        'by-tag',
        'by-title',
      ]);
      assert.deepEqual(slugsOf(await env.publicGet(`/projects?q=${encodeURIComponent('보안')}`).expect(200)), ['by-summary']);
    });

    it('q: 정규식 특수문자는 글자 그대로 검색한다', async () => {
      await create('/projects', projectBody({ slug: 'paren', title: 'React (basic)', visibility: 'public' }));
      await create('/projects', projectBody({ slug: 'reactor', title: 'Reactor', visibility: 'public' }));
      assert.deepEqual(slugsOf(await env.publicGet(`/projects?q=${encodeURIComponent('(basic')}`).expect(200)), ['paren']);
      assert.equal((await env.publicGet(`/projects?q=${encodeURIComponent('.*')}`).expect(200)).body.meta.totalItems, 0);
      assert.equal((await env.publicGet(`/projects?q=${encodeURIComponent('R.act')}`).expect(200)).body.meta.totalItems, 0);
    });

    it('q 길이 제한(2~50자, 공백 제거 후)은 400', async () => {
      for (const q of ['a', '%20%20%20', 'x'.repeat(51)]) await env.publicGet(`/projects?q=${q}`).expect(400);
    });

    it('검색어와 필터는 AND로 결합하고 meta는 필터 결과 기준', async () => {
      await create('/projects', projectBody({ slug: 'api-featured', title: 'API one', featured: true, visibility: 'public' }));
      await create('/projects', projectBody({ slug: 'api-plain', title: 'API two', visibility: 'public' }));
      await create('/projects', projectBody({ slug: 'web-featured', title: 'Web', featured: true, visibility: 'public' }));
      const res = await env.publicGet('/projects?q=api&featured=true').expect(200);
      assert.deepEqual(slugsOf(res), ['api-featured']);
      assert.equal(res.body.meta.totalItems, 1);
      assert.deepEqual(slugsOf(await env.publicGet('/projects?featured=false').expect(200)), ['api-plain']);
      await env.publicGet('/projects?featured=yes').expect(400);
    });

    it('tag 필터는 대소문자를 정규화한다', async () => {
      await create('/projects', projectBody({ slug: 'tagged', tags: ['api'], visibility: 'public' }));
      assert.deepEqual(slugsOf(await env.publicGet('/projects?tag=API').expect(200)), ['tagged']);
    });

    it('비공개 프로젝트는 검색·필터에 걸려도 공개 목록에 나오지 않는다', async () => {
      const skill = await create('/skills', skillBody({ slug: 'nodejs', visibility: 'public' }));
      await create('/projects', projectBody({ slug: 'secret', title: 'Secret API', tags: ['api'], featured: true, skillIds: [skill.id] }));
      for (const query of ['q=secret', 'tag=api', 'featured=true', 'skill=nodejs']) {
        const res = await env.publicGet(`/projects?${query}`).expect(200);
        assert.equal(res.body.meta.totalItems, 0, query);
      }
      await env.publicGet('/projects?visibility=private').expect(400); // 공개 API에는 visibility 필터가 없다
    });

    it('skill 필터: 공개 API는 공개 기술만 — 비공개 기술 slug는 없는 slug와 같은 빈 목록', async () => {
      const publicSkill = await create('/skills', skillBody({ slug: 'react', visibility: 'public' }));
      const privateSkill = await create('/skills', skillBody({ slug: 'secret-skill', visibility: 'private' }));
      await create('/projects', projectBody({ slug: 'uses-both', skillIds: [publicSkill.id, privateSkill.id], visibility: 'public' }));

      assert.deepEqual(slugsOf(await env.publicGet('/projects?skill=react').expect(200)), ['uses-both']);
      const viaPrivate = await env.publicGet('/projects?skill=secret-skill').expect(200);
      const viaMissing = await env.publicGet('/projects?skill=no-such-skill').expect(200);
      assert.deepEqual(viaPrivate.body, viaMissing.body, '비공개 기술과 없는 기술의 응답이 같아야 한다');
      assert.deepEqual(viaPrivate.body.data, []);

      const admin = await env.admin.get('/projects?skill=secret-skill').expect(200);
      assert.deepEqual(slugsOf(admin), ['uses-both'], '관리자는 비공개 기술로도 필터할 수 있다');
      await env.publicGet('/projects?skill=Not_A_Slug').expect(400);
    });

    it('관리자: visibility 필터와 관리자 전용 정렬 필드', async () => {
      await create('/projects', projectBody({ slug: 'pub', visibility: 'public' }));
      await create('/projects', projectBody({ slug: 'priv', visibility: 'private' }));
      assert.deepEqual(slugsOf(await env.admin.get('/projects?visibility=private').expect(200)), ['priv']);
      await env.admin.get('/projects?sort=-createdAt').expect(200);
      await env.publicGet('/projects?sort=-createdAt').expect(400); // 공개 정렬 허용 목록 밖
    });

    it('sort: 지정한 필드·방향으로 정렬하고, 잘못된 sort는 400', async () => {
      await create('/projects', projectBody({ slug: 'p-b', title: 'B', startedAt: '2026-02-01', visibility: 'public' }));
      await create('/projects', projectBody({ slug: 'p-a', title: 'A', startedAt: '2026-02-01', visibility: 'public' }));
      await create('/projects', projectBody({ slug: 'p-c', title: 'C', startedAt: '2026-03-01', visibility: 'public' }));
      assert.deepEqual(slugsOf(await env.publicGet('/projects?sort=title').expect(200)), ['p-a', 'p-b', 'p-c']);
      assert.deepEqual(slugsOf(await env.publicGet('/projects?sort=-title').expect(200)), ['p-c', 'p-b', 'p-a']);
      assert.deepEqual(slugsOf(await env.publicGet('/projects?sort=-startedAt,title').expect(200)), ['p-c', 'p-a', 'p-b']);
      for (const sort of ['name', 'title,startedAt,sortOrder', 'title,-title', '']) {
        await env.publicGet(`/projects?sort=${sort}`).expect(400);
      }
      await env.publicGet('/projects?sort=title&sort=-title').expect(400); // 중복 파라미터
    });

    it('정렬 동점: sort를 지정하면 _id가 마지막 필드 방향을 따르고, 페이지를 넘겨도 순서가 안정적이다', async () => {
      const ids = [];
      for (let i = 0; i < 5; i += 1) {
        ids.push((await create('/projects', projectBody({ title: '같은 제목', visibility: 'public' }))).id);
      }
      const asc = await env.publicGet('/projects?sort=title').expect(200);
      assert.deepEqual(idsOf(asc), ascending(ids));
      const desc = await env.publicGet('/projects?sort=-title').expect(200);
      assert.deepEqual(idsOf(desc), descending(ids));

      const paged = [];
      for (let page = 1; page <= 5; page += 1) {
        paged.push(...idsOf(await env.publicGet(`/projects?sort=title&limit=1&page=${page}`).expect(200)));
      }
      assert.deepEqual(paged, ascending(ids), '페이지를 넘겨도 중복·누락 없이 같은 순서');
      assert.deepEqual(idsOf(await env.publicGet('/projects?sort=title').expect(200)), idsOf(asc), '반복 조회 시 같은 순서');
    });

    it('정렬 동점: sort가 없으면 기본 정렬(sortOrder ↑, startedAt ↓, _id ↓)을 유지한다', async () => {
      const ids = [];
      for (let i = 0; i < 3; i += 1) ids.push((await create('/projects', projectBody({ visibility: 'public' }))).id);
      assert.deepEqual(idsOf(await env.publicGet('/projects').expect(200)), descending(ids));
    });
  });

  describe('학습 기록', () => {
    it('from·to: KST 날짜 경계 (from은 KST 00:00부터, to는 그날 전체)', async () => {
      await create('/study-records', studyRecordBody({ slug: 'kst-0831-2359', learnedAt: '2026-08-31T23:59:59+09:00', visibility: 'public' }));
      await create('/study-records', studyRecordBody({ slug: 'date-only-0901', learnedAt: '2026-09-01', visibility: 'public' }));
      await create('/study-records', studyRecordBody({ slug: 'kst-0901-2330', learnedAt: '2026-09-01T23:30:00+09:00', visibility: 'public' }));
      await create('/study-records', studyRecordBody({ slug: 'kst-0902-0000', learnedAt: '2026-09-02T00:00:00+09:00', visibility: 'public' }));

      const sameDay = await env.publicGet('/study-records?from=2026-09-01&to=2026-09-01&sort=learnedAt').expect(200);
      assert.deepEqual(slugsOf(sameDay), ['date-only-0901', 'kst-0901-2330']);
      assert.deepEqual(slugsOf(await env.publicGet('/study-records?to=2026-08-31').expect(200)), ['kst-0831-2359']);
      assert.deepEqual(slugsOf(await env.publicGet('/study-records?from=2026-09-02').expect(200)), ['kst-0902-0000']);

      const dateOnly = sameDay.body.data.find((record) => record.slug === 'date-only-0901');
      assert.equal(dateOnly.learnedAt, '2026-09-01T00:00:00.000Z', '날짜만 입력한 값의 직렬화 규칙 유지');
    });

    it('from·to 검증: from > to, 없는 날짜, 시각 포함 값은 400', async () => {
      await env.publicGet('/study-records?from=2026-09-02&to=2026-09-01').expect(400);
      await env.publicGet('/study-records?from=2026-02-30').expect(400);
      await env.publicGet('/study-records?to=2026-09-01T00:00:00Z').expect(400);
      await env.publicGet('/study-records?from=2026-09-01&from=2026-09-02').expect(400);
    });

    it('category·tag·q 필터와 공개 데이터 규칙', async () => {
      await create('/study-records', studyRecordBody({ slug: 'trouble', category: 'troubleshooting', title: 'CORS 오류 해결', tags: ['cors'], visibility: 'public' }));
      await create('/study-records', studyRecordBody({ slug: 'study', category: 'study', title: 'CORS 정리', visibility: 'public' }));
      await create('/study-records', studyRecordBody({ slug: 'hidden', category: 'troubleshooting', title: 'CORS 비공개', tags: ['cors'] }));

      assert.deepEqual(slugsOf(await env.publicGet('/study-records?category=troubleshooting').expect(200)), ['trouble']);
      assert.deepEqual(slugsOf(await env.publicGet('/study-records?tag=cors').expect(200)), ['trouble']);
      // 제목 정렬은 코드 포인트 순서: 'CORS 오류 해결'(오 U+C624) < 'CORS 정리'(정 U+C815) — 가나다 순서와 같다
      assert.deepEqual(slugsOf(await env.publicGet('/study-records?q=cors&sort=title').expect(200)), ['trouble', 'study']);
      await env.publicGet('/study-records?category=diary').expect(400);
      assert.equal((await env.admin.get('/study-records?q=cors').expect(200)).body.meta.totalItems, 3);
    });

    it('skill 필터: 비공개 기술 slug는 공개 API에서 빈 목록, 관리자는 조회 가능', async () => {
      const privateSkill = await create('/skills', skillBody({ slug: 'internal-tool', visibility: 'private' }));
      await create('/study-records', studyRecordBody({ slug: 'uses-private', skillIds: [privateSkill.id], visibility: 'public' }));
      assert.deepEqual((await env.publicGet('/study-records?skill=internal-tool').expect(200)).body.data, []);
      assert.deepEqual(slugsOf(await env.admin.get('/study-records?skill=internal-tool').expect(200)), ['uses-private']);
    });

    it('sort 허용 목록: 공개는 learnedAt·title, 관리자는 + createdAt·updatedAt', async () => {
      await create('/study-records', studyRecordBody({ slug: 'r-1', learnedAt: '2026-01-01', visibility: 'public' }));
      await create('/study-records', studyRecordBody({ slug: 'r-2', learnedAt: '2026-02-01', visibility: 'public' }));
      assert.deepEqual(slugsOf(await env.publicGet('/study-records?sort=learnedAt').expect(200)), ['r-1', 'r-2']);
      assert.deepEqual(slugsOf(await env.publicGet('/study-records').expect(200)), ['r-2', 'r-1'], '기본 -learnedAt');
      await env.publicGet('/study-records?sort=updatedAt').expect(400);
      await env.admin.get('/study-records?sort=updatedAt').expect(200);
    });
  });

  describe('기술 스택', () => {
    it('공개: category·status 필터만, 검색·정렬·visibility는 400', async () => {
      await create('/skills', skillBody({ slug: 'express', category: 'backend', status: 'applied', visibility: 'public' }));
      await create('/skills', skillBody({ slug: 'react', category: 'frontend', status: 'learning', visibility: 'public' }));
      await create('/skills', skillBody({ slug: 'hidden-be', category: 'backend', status: 'applied' }));

      assert.deepEqual(slugsOf(await env.publicGet('/skills?category=backend').expect(200)), ['express']);
      assert.deepEqual(slugsOf(await env.publicGet('/skills?status=learning').expect(200)), ['react']);
      assert.deepEqual((await env.publicGet('/skills?category=backend&status=applied').expect(200)).body.meta, { totalItems: 1 });
      for (const query of ['q=react', 'sort=name', 'visibility=private', 'category=cooking', 'category=backend&category=frontend']) {
        await env.publicGet(`/skills?${query}`).expect(400);
      }
    });

    it('관리자: 이름 검색(특수문자 이스케이프)·visibility 필터', async () => {
      await create('/skills', skillBody({ name: 'C++', slug: 'cpp' }));
      await create('/skills', skillBody({ name: 'C', slug: 'c' }));
      await create('/skills', skillBody({ name: 'Node.js', slug: 'nodejs', visibility: 'public' }));
      assert.deepEqual(slugsOf(await env.admin.get(`/skills?q=${encodeURIComponent('C+')}`).expect(200)), ['cpp']);
      assert.deepEqual(slugsOf(await env.admin.get('/skills?q=NODE').expect(200)), ['nodejs']);
      assert.deepEqual(slugsOf(await env.admin.get('/skills?visibility=public').expect(200)), ['nodejs']);
      await env.admin.get('/skills?page=1').expect(400); // 기술 목록은 페이지네이션 없음
    });

    it('관리자 sort: 허용 필드만, 동점은 _id가 마지막 필드 방향을 따른다', async () => {
      const ids = [];
      for (let i = 0; i < 4; i += 1) ids.push((await create('/skills', skillBody({ sortOrder: 5 }))).id);
      assert.deepEqual(idsOf(await env.admin.get('/skills?sort=sortOrder').expect(200)), ascending(ids));
      assert.deepEqual(idsOf(await env.admin.get('/skills?sort=-sortOrder').expect(200)), descending(ids));
      await env.admin.get('/skills?sort=category').expect(400);
    });
  });
});
