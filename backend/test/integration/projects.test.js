import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { StudyRecord } from '../../src/modules/study-records/studyRecord.model.js';
import { testAppConfig } from '../helpers/config.js';
import {
  MISSING_ID,
  projectBody,
  SETUP_TIMEOUT_MS,
  silentLogger,
  skillBody,
  startContentTestEnv,
  studyRecordBody,
} from '../helpers/content.js';

const ADMIN_ONLY_FIELDS = ['visibility', 'sortOrder', 'skillIds', 'createdAt'];

describe('프로젝트(Project) CRUD', () => {
  let env;

  before(async () => {
    env = await startContentTestEnv();
  }, { timeout: SETUP_TIMEOUT_MS });

  after(async () => env?.stop());
  beforeEach(async () => env.reset());

  const createSkill = async (overrides) => (await env.admin.post('/skills', skillBody(overrides)).expect(201)).body.data;
  const createProject = async (overrides) =>
    (await env.admin.post('/projects', projectBody(overrides)).expect(201)).body.data;

  describe('인증·인가', () => {
    it('로그인하지 않으면 /admin/projects 전체가 401', async () => {
      await env.anonymous.get('/projects').expect(401);
      await env.anonymous.get(`/projects/${MISSING_ID}`).expect(401);
      await env.anonymous.post('/projects', projectBody()).expect(401);
      await env.anonymous.patch(`/projects/${MISSING_ID}`, { title: 'x' }).expect(401);
      await env.anonymous.delete(`/projects/${MISSING_ID}`).expect(401);
    });
  });

  describe('POST /admin/projects', () => {
    it('생성하면 201, 기본값과 기술 요약을 포함한다 (비공개면 publishedAt null)', async () => {
      const skill = await createSkill();
      const project = await createProject({ skillIds: [skill.id], tags: ['Portfolio', 'portfolio', 'api'] });
      assert.equal(project.visibility, 'private');
      assert.equal(project.publishedAt, null);
      assert.equal(project.featured, false);
      assert.equal(project.endedAt, null);
      assert.equal(project.startedAt, '2026-01-01T00:00:00.000Z');
      assert.deepEqual(project.skillIds, [skill.id]);
      assert.deepEqual(project.skills, [{ id: skill.id, name: skill.name, slug: skill.slug, category: skill.category }]);
      assert.deepEqual(project.tags, ['portfolio', 'api'], '소문자 정규화 + 중복 제거');
      assert.deepEqual(project.relatedStudyRecords, []);
    });

    it('공개로 생성하면 publishedAt을 기록한다', async () => {
      const project = await createProject({ visibility: 'public' });
      assert.ok(Date.parse(project.publishedAt) > 0);
    });

    it('존재하지 않는 기술 ID는 400, ID 형식 오류도 400', async () => {
      const missing = await env.admin.post('/projects', projectBody({ skillIds: [MISSING_ID] })).expect(400);
      assert.equal(missing.body.error.details[0].field, 'skillIds');
      await env.admin.post('/projects', projectBody({ skillIds: ['not-an-id'] })).expect(400);
    });

    it('endedAt이 startedAt보다 이르면 400', async () => {
      const res = await env.admin
        .post('/projects', projectBody({ startedAt: '2026-05-01', endedAt: '2026-04-30' }))
        .expect(400);
      assert.equal(res.body.error.details[0].field, 'endedAt');
    });

    it('https가 아닌 URL, 잘못된 날짜, 범위를 벗어난 값은 400', async () => {
      await env.admin.post('/projects', projectBody({ githubUrl: 'http://github.com/x' })).expect(400);
      await env.admin.post('/projects', projectBody({ demoUrl: 'javascript:alert(1)' })).expect(400);
      await env.admin.post('/projects', projectBody({ startedAt: '2026-02-30' })).expect(400);
      await env.admin.post('/projects', projectBody({ startedAt: 'yesterday' })).expect(400);
      await env.admin.post('/projects', projectBody({ teamSize: 0 })).expect(400);
      await env.admin.post('/projects', projectBody({ tags: Array.from({ length: 11 }, (_, i) => `t${i}`) })).expect(400);
      await env.admin.post('/projects', projectBody({ slug: 'ab' })).expect(400); // 프로젝트 slug는 3자 이상
    });

    it('빈 문자열 URL은 null로 저장한다', async () => {
      const project = await createProject({ githubUrl: '', demoUrl: 'https://demo.example.com' });
      assert.equal(project.githubUrl, null);
      assert.equal(project.demoUrl, 'https://demo.example.com');
    });

    it('slug 중복은 409 DUPLICATE_KEY', async () => {
      await createProject({ slug: 'my-portfolio' });
      const res = await env.admin.post('/projects', projectBody({ slug: 'my-portfolio' })).expect(409);
      assert.equal(res.body.error.code, 'DUPLICATE_KEY');
    });
  });

  describe('GET /projects (공개 목록)', () => {
    it('공개 프로젝트만, 목록 필드만, 비공개 기술은 빼고 반환한다', async () => {
      const publicSkill = await createSkill({ visibility: 'public' });
      const privateSkill = await createSkill({ visibility: 'private' });
      await createProject({ visibility: 'public', skillIds: [publicSkill.id, privateSkill.id], highlights: ['성과'] });
      await createProject({ visibility: 'private' });

      const res = await env.publicGet('/projects').expect(200);
      assert.equal(res.body.data.length, 1);
      const item = res.body.data[0];
      assert.deepEqual(item.skills.map((skill) => skill.id), [publicSkill.id]);
      assert.equal(item.description, undefined, '목록에는 본문 없음');
      assert.equal(item.highlights, undefined);
      for (const field of ADMIN_ONLY_FIELDS) assert.equal(item[field], undefined, field);
    });

    it('기본 정렬: sortOrder 오름차순, 같으면 startedAt 내림차순', async () => {
      await createProject({ slug: 'p-late', visibility: 'public', sortOrder: 1, startedAt: '2026-06-01' });
      await createProject({ slug: 'p-early', visibility: 'public', sortOrder: 1, startedAt: '2026-01-01' });
      await createProject({ slug: 'p-first', visibility: 'public', sortOrder: 0, startedAt: '2025-01-01' });
      const res = await env.publicGet('/projects').expect(200);
      assert.deepEqual(res.body.data.map((project) => project.slug), ['p-first', 'p-late', 'p-early']);
    });

    it('page·limit 페이지네이션과 meta', async () => {
      for (let i = 0; i < 3; i += 1) await createProject({ visibility: 'public' });
      const first = await env.publicGet('/projects?page=1&limit=2').expect(200);
      assert.equal(first.body.data.length, 2);
      assert.deepEqual(first.body.meta, { page: 1, limit: 2, totalItems: 3, totalPages: 2, hasNext: true });
      const second = await env.publicGet('/projects?page=2&limit=2').expect(200);
      assert.equal(second.body.data.length, 1);
      assert.equal(second.body.meta.hasNext, false);
      const beyond = await env.publicGet('/projects?page=5&limit=2').expect(200);
      assert.deepEqual(beyond.body.data, []);
      assert.equal(beyond.body.meta.totalItems, 3);
      const defaults = await env.publicGet('/projects').expect(200);
      assert.deepEqual([defaults.body.meta.page, defaults.body.meta.limit], [1, 10]);
    });

    it('잘못된 page·limit, 정의되지 않은 파라미터, 중복·객체형 파라미터는 400', async () => {
      // 4단계에서 q·sort·featured는 정상 파라미터가 되었으므로, 여전히 잘못된 파라미터로 거부 규칙을 확인한다
      for (const query of ['page=0', 'limit=51', 'limit=abc', 'page=1.5', 'foo=1', 'search=react', 'page=1&page=2', 'page[$gt]=1']) {
        const res = await env.publicGet(`/projects?${query}`);
        assert.equal(res.status, 400, query);
        assert.equal(res.body.error.code, 'VALIDATION_ERROR', query);
      }
    });
  });

  describe('GET /projects/:slug (공개 상세)', () => {
    it('공개 프로젝트 상세와 공개 관련 학습 기록(최대 5개, 최신순)을 반환한다', async () => {
      const project = await createProject({ slug: 'detail-project', visibility: 'public', role: '백엔드' });
      for (let i = 1; i <= 6; i += 1) {
        await env.admin
          .post('/study-records', studyRecordBody({ projectIds: [project.id], learnedAt: `2026-01-0${i}`, visibility: 'public' }))
          .expect(201);
      }
      await env.admin.post('/study-records', studyRecordBody({ projectIds: [project.id], visibility: 'private' })).expect(201);

      const res = await env.publicGet('/projects/detail-project').expect(200);
      const detail = res.body.data;
      assert.equal(detail.role, '백엔드');
      assert.equal(detail.description, '## 개요\n본문');
      assert.equal(detail.relatedStudyRecords.length, 5);
      assert.equal(detail.relatedStudyRecords[0].learnedAt, '2026-01-06T00:00:00.000Z');
      assert.deepEqual(Object.keys(detail.relatedStudyRecords[0]).sort(), ['id', 'learnedAt', 'slug', 'title']);
      for (const field of ADMIN_ONLY_FIELDS) assert.equal(detail[field], undefined, field);
    });

    it('비공개·없는·형식 오류 slug는 모두 404 NOT_FOUND', async () => {
      await createProject({ slug: 'hidden-project', visibility: 'private' });
      for (const slug of ['hidden-project', 'no-such-project', 'Bad_Slug', '..', 'a'.repeat(81)]) {
        const res = await env.publicGet(`/projects/${slug}`);
        assert.equal(res.status, 404, slug);
        assert.equal(res.body.error.code, 'NOT_FOUND');
      }
    });
  });

  describe('관리자 조회', () => {
    it('관리자 목록은 비공개 포함, 최근 수정순, 관리자 필드 포함', async () => {
      const older = await createProject({ visibility: 'public' });
      const newer = await createProject();
      const res = await env.admin.get('/projects').expect(200);
      assert.deepEqual(res.body.data.map((project) => project.id), [newer.id, older.id]);
      assert.equal(res.body.data[0].visibility, 'private');
      assert.ok(Array.isArray(res.body.data[0].skillIds));
      assert.equal(res.body.data[0].description, undefined);
    });

    it('관리자 상세는 비공개 기술도 포함한다', async () => {
      const privateSkill = await createSkill({ visibility: 'private' });
      const project = await createProject({ skillIds: [privateSkill.id] });
      const res = await env.admin.get(`/projects/${project.id}`).expect(200);
      assert.deepEqual(res.body.data.skills.map((skill) => skill.id), [privateSkill.id]);
    });

    it('ID 형식 오류 400 INVALID_ID, 없는 ID 404', async () => {
      assert.equal((await env.admin.get('/projects/abc').expect(400)).body.error.code, 'INVALID_ID');
      await env.admin.get(`/projects/${MISSING_ID}`).expect(404);
    });
  });

  describe('PATCH /admin/projects/:id', () => {
    it('처음 공개될 때 publishedAt을 기록하고, 다시 비공개로 바꿔도 유지한다', async () => {
      const project = await createProject();
      const published = (await env.admin.patch(`/projects/${project.id}`, { visibility: 'public' }).expect(200)).body.data;
      assert.ok(published.publishedAt);
      const hidden = (await env.admin.patch(`/projects/${project.id}`, { visibility: 'private' }).expect(200)).body.data;
      assert.equal(hidden.publishedAt, published.publishedAt);
      const republished = (await env.admin.patch(`/projects/${project.id}`, { visibility: 'public' }).expect(200)).body.data;
      assert.equal(republished.publishedAt, published.publishedAt);
    });

    it('기존 startedAt보다 이른 endedAt으로 바꾸면 400', async () => {
      const project = await createProject({ startedAt: '2026-05-01' });
      await env.admin.patch(`/projects/${project.id}`, { endedAt: '2026-04-01' }).expect(400);
      await env.admin.patch(`/projects/${project.id}`, { endedAt: '2026-06-01' }).expect(200);
      await env.admin.patch(`/projects/${project.id}`, { startedAt: '2026-07-01' }).expect(400);
    });

    it('null로 선택 필드를 지우고, 필수 필드 null·서버 필드는 400', async () => {
      const project = await createProject({ role: '백엔드', teamSize: 3 });
      const res = await env.admin.patch(`/projects/${project.id}`, { role: null, teamSize: null }).expect(200);
      assert.equal(res.body.data.role, null);
      assert.equal(res.body.data.teamSize, null);
      await env.admin.patch(`/projects/${project.id}`, { title: null }).expect(400);
      await env.admin.patch(`/projects/${project.id}`, { publishedAt: null }).expect(400);
    });

    it('다른 프로젝트의 slug로 바꾸면 409, 없는 기술 ID는 400, 없는 ID는 404', async () => {
      await createProject({ slug: 'taken-slug' });
      const project = await createProject();
      await env.admin.patch(`/projects/${project.id}`, { slug: 'taken-slug' }).expect(409);
      await env.admin.patch(`/projects/${project.id}`, { skillIds: [MISSING_ID] }).expect(400);
      await env.admin.patch(`/projects/${MISSING_ID}`, { title: 'x' }).expect(404);
    });
  });

  describe('DELETE /admin/projects/:id', () => {
    it('삭제하면 204, 학습 기록의 projectIds에서 참조를 제거한다', async () => {
      const project = await createProject();
      const keep = await createProject();
      const record = (
        await env.admin.post('/study-records', studyRecordBody({ projectIds: [project.id, keep.id] })).expect(201)
      ).body.data;

      await env.admin.delete(`/projects/${project.id}`).expect(204);
      await env.admin.get(`/projects/${project.id}`).expect(404);
      const stored = await StudyRecord.findById(record.id).lean();
      assert.deepEqual(stored.projectIds.map(String), [keep.id]);
    });

    it('ID 형식 오류 400, 없는 ID 404', async () => {
      await env.admin.delete('/projects/zzz').expect(400);
      await env.admin.delete(`/projects/${MISSING_ID}`).expect(404);
    });
  });

  describe('공개 GET 요청 제한', () => {
    it('같은 IP에서 1분에 120회를 넘으면 429 RATE_LIMITED, 관리자 API와 헬스 체크는 제외', async () => {
      const app = createApp(testAppConfig, { logger: silentLogger });
      for (let i = 0; i < 120; i += 1) {
        await request(app).get(i % 2 === 0 ? '/api/v1/projects' : '/api/v1/skills').expect(200);
      }
      const limited = await request(app).get('/api/v1/study-records').expect(429);
      assert.equal(limited.body.error.code, 'RATE_LIMITED');
      assert.ok(Number(limited.headers['retry-after']) > 0);
      await request(app).get('/api/v1/health').expect(200);
      await request(app).get('/api/v1/admin/projects').expect(401); // 제한이 아니라 인증으로 거부
    });
  });
});
