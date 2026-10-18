import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  MISSING_ID,
  projectBody,
  SETUP_TIMEOUT_MS,
  skillBody,
  startContentTestEnv,
  studyRecordBody,
} from '../helpers/content.js';

const ADMIN_ONLY_FIELDS = ['visibility', 'skillIds', 'projectIds', 'createdAt'];
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const kstDate = (offsetDays = 0) =>
  new Date(Date.now() + KST_OFFSET_MS + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe('학습 기록(Study Record) CRUD', () => {
  let env;

  before(async () => {
    env = await startContentTestEnv();
  }, { timeout: SETUP_TIMEOUT_MS });

  after(async () => env?.stop());
  beforeEach(async () => env.reset());

  const create = async (path, body) => (await env.admin.post(path, body).expect(201)).body.data;
  const createRecord = (overrides) => create('/study-records', studyRecordBody(overrides));

  describe('인증·인가', () => {
    it('로그인하지 않으면 /admin/study-records 전체가 401', async () => {
      await env.anonymous.get('/study-records').expect(401);
      await env.anonymous.get(`/study-records/${MISSING_ID}`).expect(401);
      await env.anonymous.post('/study-records', studyRecordBody()).expect(401);
      await env.anonymous.patch(`/study-records/${MISSING_ID}`, { title: 'x' }).expect(401);
      await env.anonymous.delete(`/study-records/${MISSING_ID}`).expect(401);
    });
  });

  describe('POST /admin/study-records', () => {
    it('기술·프로젝트를 연결해 생성하고 관리자 응답을 반환한다', async () => {
      const skill = await create('/skills', skillBody());
      const project = await create('/projects', projectBody());
      const record = await createRecord({ skillIds: [skill.id], projectIds: [project.id], summary: '요약' });
      assert.deepEqual(record.skillIds, [skill.id]);
      assert.deepEqual(record.projectIds, [project.id]);
      assert.deepEqual(record.relatedProjects, [{ id: project.id, slug: project.slug, title: project.title }]);
      assert.equal(record.visibility, 'private');
      assert.equal(record.publishedAt, null);
    });

    it('존재하지 않는 프로젝트·기술 ID는 400 (field 표시)', async () => {
      const noProject = await env.admin.post('/study-records', studyRecordBody({ projectIds: [MISSING_ID] })).expect(400);
      assert.equal(noProject.body.error.details[0].field, 'projectIds');
      const noSkill = await env.admin.post('/study-records', studyRecordBody({ skillIds: [MISSING_ID] })).expect(400);
      assert.equal(noSkill.body.error.details[0].field, 'skillIds');
    });

    it('learnedAt: 미래 날짜는 400, 오늘(KST)은 허용', async () => {
      await env.admin.post('/study-records', studyRecordBody({ learnedAt: kstDate(2) })).expect(400);
      await env.admin.post('/study-records', studyRecordBody({ learnedAt: kstDate(0) })).expect(201);
    });

    it('카테고리·길이·개수 제한을 벗어나면 400', async () => {
      await env.admin.post('/study-records', studyRecordBody({ category: 'diary' })).expect(400);
      await env.admin.post('/study-records', studyRecordBody({ content: 'x'.repeat(50001) })).expect(400);
      await env.admin.post('/study-records', studyRecordBody({ content: '   ' })).expect(400);
      const elevenIds = Array.from({ length: 11 }, (_, i) => MISSING_ID.slice(0, -2) + String(i).padStart(2, '0'));
      await env.admin.post('/study-records', studyRecordBody({ projectIds: elevenIds })).expect(400);
    });

    it('관리자 본문 제한(256KB)을 넘으면 413', async () => {
      const res = await env.admin.post('/study-records', studyRecordBody({ content: 'x'.repeat(300 * 1024) })).expect(413);
      assert.equal(res.body.error.code, 'PAYLOAD_TOO_LARGE');
    });

    it('slug 중복은 409', async () => {
      await createRecord({ slug: 'same-record' });
      await env.admin.post('/study-records', studyRecordBody({ slug: 'same-record' })).expect(409);
    });
  });

  describe('공개 API', () => {
    it('목록: 공개 기록만, 본문·관리자 필드 없이, learnedAt 최신순', async () => {
      await createRecord({ slug: 'older', learnedAt: '2026-01-01', visibility: 'public' });
      await createRecord({ slug: 'newer', learnedAt: '2026-02-01', visibility: 'public' });
      await createRecord({ slug: 'secret', visibility: 'private' });
      const res = await env.publicGet('/study-records').expect(200);
      assert.deepEqual(res.body.data.map((record) => record.slug), ['newer', 'older']);
      assert.equal(res.body.meta.totalItems, 2);
      for (const record of res.body.data) {
        assert.equal(record.content, undefined);
        for (const field of ADMIN_ONLY_FIELDS) assert.equal(record[field], undefined, field);
      }
    });

    it('상세: 본문과 공개 프로젝트만 relatedProjects로, 비공개 기술은 제외', async () => {
      const publicProject = await create('/projects', projectBody({ visibility: 'public' }));
      const privateProject = await create('/projects', projectBody({ visibility: 'private' }));
      const privateSkill = await create('/skills', skillBody({ visibility: 'private' }));
      await createRecord({
        slug: 'public-record',
        visibility: 'public',
        projectIds: [privateProject.id, publicProject.id],
        skillIds: [privateSkill.id],
      });
      const res = await env.publicGet('/study-records/public-record').expect(200);
      assert.equal(res.body.data.content, '# 정리\n내용');
      assert.deepEqual(res.body.data.relatedProjects.map((project) => project.id), [publicProject.id]);
      assert.deepEqual(res.body.data.skills, []);
      for (const field of ADMIN_ONLY_FIELDS) assert.equal(res.body.data[field], undefined, field);
    });

    it('비공개·없는·형식 오류 slug는 404', async () => {
      await createRecord({ slug: 'private-record' });
      for (const slug of ['private-record', 'missing-record', 'UPPER']) {
        assert.equal((await env.publicGet(`/study-records/${slug}`)).status, 404, slug);
      }
    });

    it('페이지네이션 파라미터 오류와 정의되지 않은 파라미터는 400', async () => {
      await env.publicGet('/study-records?limit=0').expect(400);
      const res = await env.publicGet('/study-records?foo=1').expect(400);
      assert.equal(res.body.error.details[0].field, 'foo');
    });
  });

  describe('관리자 조회·수정·삭제', () => {
    it('관리자 목록은 비공개 포함, 상세는 비공개 프로젝트도 relatedProjects에 포함', async () => {
      const privateProject = await create('/projects', projectBody());
      const record = await createRecord({ projectIds: [privateProject.id] });
      const list = await env.admin.get('/study-records').expect(200);
      assert.equal(list.body.meta.totalItems, 1);
      const detail = await env.admin.get(`/study-records/${record.id}`).expect(200);
      assert.deepEqual(detail.body.data.relatedProjects.map((project) => project.id), [privateProject.id]);
    });

    it('PATCH: 부분 수정, 공개 시 publishedAt, 빈 projectIds로 연결 해제', async () => {
      const project = await create('/projects', projectBody());
      const record = await createRecord({ projectIds: [project.id] });
      const res = await env.admin
        .patch(`/study-records/${record.id}`, { visibility: 'public', projectIds: [], summary: '새 요약' })
        .expect(200);
      assert.ok(res.body.data.publishedAt);
      assert.deepEqual(res.body.data.projectIds, []);
      assert.equal(res.body.data.summary, '새 요약');
      assert.equal(res.body.data.title, record.title);
    });

    it('PATCH 오류: 없는 프로젝트 400, 미래 날짜 400, 빈 본문 400, 없는 ID 404, 형식 오류 400', async () => {
      const record = await createRecord();
      await env.admin.patch(`/study-records/${record.id}`, { projectIds: [MISSING_ID] }).expect(400);
      await env.admin.patch(`/study-records/${record.id}`, { learnedAt: kstDate(3) }).expect(400);
      await env.admin.patch(`/study-records/${record.id}`, {}).expect(400);
      await env.admin.patch(`/study-records/${MISSING_ID}`, { title: 'x' }).expect(404);
      await env.admin.patch('/study-records/1', { title: 'x' }).expect(400);
    });

    it('DELETE: 204 후 404, 없는 ID 404', async () => {
      const record = await createRecord();
      await env.admin.delete(`/study-records/${record.id}`).expect(204);
      await env.admin.get(`/study-records/${record.id}`).expect(404);
      await env.admin.delete(`/study-records/${record.id}`).expect(404);
    });
  });
});
