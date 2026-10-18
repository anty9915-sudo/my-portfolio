import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { TEST_ORIGIN } from '../helpers/config.js';
import {
  MISSING_ID,
  projectBody,
  SETUP_TIMEOUT_MS,
  skillBody,
  startContentTestEnv,
  studyRecordBody,
} from '../helpers/content.js';

const ADMIN_ONLY_FIELDS = ['visibility', 'sortOrder', 'createdAt', 'updatedAt', 'usage'];

describe('기술(Skill) CRUD', () => {
  let env;

  before(async () => {
    env = await startContentTestEnv();
  }, { timeout: SETUP_TIMEOUT_MS });

  after(async () => env?.stop());
  beforeEach(async () => env.reset());

  describe('인증·인가', () => {
    it('로그인하지 않으면 모든 /admin/skills 요청이 401', async () => {
      await env.anonymous.get('/skills').expect(401);
      await env.anonymous.get(`/skills/${MISSING_ID}`).expect(401);
      await env.anonymous.post('/skills', skillBody()).expect(401);
      await env.anonymous.patch(`/skills/${MISSING_ID}`, { name: 'x' }).expect(401);
      const res = await env.anonymous.delete(`/skills/${MISSING_ID}`).expect(401);
      assert.equal(res.body.error.code, 'UNAUTHENTICATED');
    });

    it('로그인 상태라도 Origin이 없으면 변경 요청은 403', async () => {
      await request(env.app).post('/api/v1/admin/skills').send(skillBody()).expect(403);
    });
  });

  describe('POST /admin/skills', () => {
    it('생성하면 201과 관리자 응답(기본값 포함)을 반환한다', async () => {
      const res = await env.admin.post('/skills', skillBody({ name: 'Node.js', slug: 'nodejs' })).expect(201);
      const skill = res.body.data;
      assert.match(skill.id, /^[0-9a-f]{24}$/);
      assert.equal(skill.name, 'Node.js');
      assert.equal(skill.visibility, 'private');
      assert.equal(skill.sortOrder, 0);
      assert.equal(skill.description, null);
      assert.equal(skill.iconKey, null);
      assert.ok(skill.createdAt && skill.updatedAt);
      assert.equal(skill._id, undefined);
    });

    it('1자 slug(c, go, r)를 허용한다', async () => {
      await env.admin.post('/skills', skillBody({ name: 'C', slug: 'c' })).expect(201);
    });

    it('필수 필드가 없으면 400과 필드별 details', async () => {
      const res = await env.admin.post('/skills', { name: 'X' }).expect(400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      const fields = res.body.error.details.map((detail) => detail.field).sort();
      assert.deepEqual(fields, ['category', 'slug', 'status']);
    });

    it('정의되지 않은 필드·서버 관리 필드는 400', async () => {
      for (const extra of [{ id: MISSING_ID }, { createdAt: '2026-01-01' }, { publishedAt: '2026-01-01' }, { foo: 1 }]) {
        const res = await env.admin.post('/skills', { ...skillBody(), ...extra }).expect(400);
        assert.equal(res.body.error.details[0].field, Object.keys(extra)[0]);
      }
    });

    it('허용되지 않은 값(enum·slug 형식·길이·iconKey)은 400', async () => {
      await env.admin.post('/skills', skillBody({ category: 'cooking' })).expect(400);
      await env.admin.post('/skills', skillBody({ status: 'expert' })).expect(400);
      await env.admin.post('/skills', skillBody({ slug: 'Node JS' })).expect(400);
      await env.admin.post('/skills', skillBody({ name: 'x'.repeat(51) })).expect(400);
      await env.admin.post('/skills', skillBody({ iconKey: 'Bad_Key' })).expect(400);
      await env.admin.post('/skills', skillBody({ sortOrder: 1.5 })).expect(400);
    });

    it('slug 중복은 409 DUPLICATE_KEY', async () => {
      await env.admin.post('/skills', skillBody({ slug: 'react' })).expect(201);
      const res = await env.admin.post('/skills', skillBody({ slug: 'react' })).expect(409);
      assert.equal(res.body.error.code, 'DUPLICATE_KEY');
    });

    it('이름은 대소문자만 달라도 409 DUPLICATE_KEY', async () => {
      await env.admin.post('/skills', skillBody({ name: 'React' })).expect(201);
      const res = await env.admin.post('/skills', skillBody({ name: 'react' })).expect(409);
      assert.match(res.body.error.message, /name/);
    });

    it('로그인한 요청의 JSON이 아닌 본문은 415', async () => {
      const res = await env.agent
        .post('/api/v1/admin/skills')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'text/plain')
        .send('name=x')
        .expect(415);
      assert.equal(res.body.error.code, 'UNSUPPORTED_MEDIA_TYPE');
    });

    it('로그인하지 않은 요청은 본문 형식과 관계없이 401 (인증을 먼저 확인)', async () => {
      await request(env.app)
        .post('/api/v1/admin/skills')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'text/plain')
        .send('x')
        .expect(401);
    });
  });

  describe('GET /skills (공개)', () => {
    it('공개 기술만, 관리자 필드 없이, category·sortOrder·name 순으로 반환한다', async () => {
      await env.admin.post('/skills', skillBody({ name: 'Zod', category: 'tool', visibility: 'public' })).expect(201);
      await env.admin.post('/skills', skillBody({ name: 'Express', category: 'backend', sortOrder: 2, visibility: 'public' })).expect(201);
      await env.admin.post('/skills', skillBody({ name: 'Node.js', category: 'backend', sortOrder: 1, visibility: 'public' })).expect(201);
      await env.admin.post('/skills', skillBody({ name: 'Secret', category: 'backend', visibility: 'private' })).expect(201);

      const res = await env.publicGet('/skills').expect(200);
      assert.deepEqual(res.body.data.map((skill) => skill.name), ['Node.js', 'Express', 'Zod']);
      assert.deepEqual(res.body.meta, { totalItems: 3 });
      for (const skill of res.body.data) {
        for (const field of ADMIN_ONLY_FIELDS) assert.equal(skill[field], undefined, field);
      }
    });

    it('page·limit(페이지네이션 없음)과 정의되지 않은 파라미터는 400', async () => {
      await env.publicGet('/skills?page=1').expect(400);
      const res = await env.publicGet('/skills?foo=1').expect(400);
      assert.equal(res.body.error.details[0].field, 'foo');
    });
  });

  describe('GET /admin/skills, /admin/skills/:id', () => {
    it('관리자 목록은 비공개를 포함한다', async () => {
      await env.admin.post('/skills', skillBody({ visibility: 'public' })).expect(201);
      await env.admin.post('/skills', skillBody()).expect(201);
      const res = await env.admin.get('/skills').expect(200);
      assert.equal(res.body.meta.totalItems, 2);
      assert.ok(res.body.data.some((skill) => skill.visibility === 'private'));
    });

    it('상세는 참조 개수(usage)를 포함한다', async () => {
      const skill = (await env.admin.post('/skills', skillBody())).body.data;
      await env.admin.post('/projects', projectBody({ skillIds: [skill.id] })).expect(201);
      await env.admin.post('/study-records', studyRecordBody({ skillIds: [skill.id] })).expect(201);
      const res = await env.admin.get(`/skills/${skill.id}`).expect(200);
      assert.deepEqual(res.body.data.usage, { projects: 1, studyRecords: 1 });
    });

    it('ID 형식 오류는 400 INVALID_ID, 없는 ID는 404 NOT_FOUND', async () => {
      const invalid = await env.admin.get('/skills/not-an-id').expect(400);
      assert.equal(invalid.body.error.code, 'INVALID_ID');
      const missing = await env.admin.get(`/skills/${MISSING_ID}`).expect(404);
      assert.equal(missing.body.error.code, 'NOT_FOUND');
    });
  });

  describe('PATCH /admin/skills/:id', () => {
    it('보낸 필드만 수정하고, 선택 필드에 null을 보내면 값을 지운다', async () => {
      const skill = (await env.admin.post('/skills', skillBody({ description: '설명', iconKey: 'node' }))).body.data;
      const res = await env.admin.patch(`/skills/${skill.id}`, { status: 'applied', description: null }).expect(200);
      assert.equal(res.body.data.status, 'applied');
      assert.equal(res.body.data.description, null);
      assert.equal(res.body.data.iconKey, 'node');
      assert.equal(res.body.data.name, skill.name);
    });

    it('필수 필드에 null, 빈 본문, 정의되지 않은 필드는 400', async () => {
      const skill = (await env.admin.post('/skills', skillBody())).body.data;
      await env.admin.patch(`/skills/${skill.id}`, { name: null }).expect(400);
      await env.admin.patch(`/skills/${skill.id}`, {}).expect(400);
      await env.admin.patch(`/skills/${skill.id}`, { updatedAt: '2026-01-01' }).expect(400);
    });

    it('다른 기술의 slug·이름(대소문자 무시)으로 바꾸면 409, 자기 값은 그대로 허용', async () => {
      await env.admin.post('/skills', skillBody({ name: 'React', slug: 'react' })).expect(201);
      const other = (await env.admin.post('/skills', skillBody({ name: 'Vue', slug: 'vue' }))).body.data;
      await env.admin.patch(`/skills/${other.id}`, { slug: 'react' }).expect(409);
      await env.admin.patch(`/skills/${other.id}`, { name: 'REACT' }).expect(409);
      await env.admin.patch(`/skills/${other.id}`, { name: 'Vue', slug: 'vue' }).expect(200);
    });

    it('ID 형식 오류 400, 없는 ID 404', async () => {
      await env.admin.patch('/skills/123', { name: 'x' }).expect(400);
      await env.admin.patch(`/skills/${MISSING_ID}`, { name: 'x' }).expect(404);
    });
  });

  describe('DELETE /admin/skills/:id', () => {
    it('사용하지 않는 기술은 204로 삭제되고 이후 404', async () => {
      const skill = (await env.admin.post('/skills', skillBody())).body.data;
      await env.admin.delete(`/skills/${skill.id}`).expect(204);
      await env.admin.get(`/skills/${skill.id}`).expect(404);
    });

    it('프로젝트나 학습 기록이 참조 중이면 409 RESOURCE_IN_USE', async () => {
      const usedByProject = (await env.admin.post('/skills', skillBody())).body.data;
      const usedByRecord = (await env.admin.post('/skills', skillBody())).body.data;
      await env.admin.post('/projects', projectBody({ skillIds: [usedByProject.id] })).expect(201);
      await env.admin.post('/study-records', studyRecordBody({ skillIds: [usedByRecord.id] })).expect(201);

      for (const skill of [usedByProject, usedByRecord]) {
        const res = await env.admin.delete(`/skills/${skill.id}`).expect(409);
        assert.equal(res.body.error.code, 'RESOURCE_IN_USE');
        await env.admin.get(`/skills/${skill.id}`).expect(200);
      }
    });

    it('ID 형식 오류 400, 없는 ID 404', async () => {
      await env.admin.delete('/skills/xyz').expect(400);
      await env.admin.delete(`/skills/${MISSING_ID}`).expect(404);
    });
  });
});
