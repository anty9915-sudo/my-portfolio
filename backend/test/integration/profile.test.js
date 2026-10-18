import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { Profile } from '../../src/modules/profile/profile.model.js';
import { TEST_ORIGIN, testAppConfig } from '../helpers/config.js';
import { SETUP_TIMEOUT_MS, silentLogger, startContentTestEnv } from '../helpers/content.js';

const PUBLIC_KEYS = ['avatarUrl', 'bio', 'email', 'goals', 'headline', 'links', 'name', 'resumeUrl', 'updatedAt'];
const ADMIN_KEYS = [...PUBLIC_KEYS, 'createdAt'].sort();

const minimal = (overrides = {}) => ({ name: '홍길동', headline: '웹 개발자', ...overrides });
const full = () => ({
  name: '홍길동',
  headline: '웹 개발과 웹 보안을 공부하는 개발자',
  bio: '## 소개\n안녕하세요',
  goals: ['안전한 웹 서비스 설계', '테스트 자동화'],
  email: 'me@example.com',
  avatarUrl: 'https://example.com/avatar.png',
  resumeUrl: 'https://example.com/resume.pdf',
  links: [
    { type: 'github', label: 'GitHub', url: 'https://github.com/example' },
    { type: 'blog', label: '블로그', url: 'https://blog.example.com' },
  ],
});

describe('프로필 API', () => {
  let env;

  before(async () => {
    env = await startContentTestEnv();
    await Profile.init(); // 테스트 DB에 singletonKey_unique 인덱스 생성
  }, { timeout: SETUP_TIMEOUT_MS });

  after(async () => env?.stop());
  beforeEach(async () => Profile.deleteMany({}));

  const put = (body) => env.agent.put('/api/v1/admin/profile').set('Origin', TEST_ORIGIN).send(body);

  describe('GET /profile (공개)', () => {
    it('프로필이 없으면 404 NOT_FOUND', async () => {
      const res = await env.publicGet('/profile').expect(404);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });

    it('API.md 8.2의 필드만 반환한다 (_id·singletonKey·createdAt 없음)', async () => {
      await put(full()).expect(201);
      const res = await env.publicGet('/profile').expect(200);
      assert.deepEqual(Object.keys(res.body.data).sort(), PUBLIC_KEYS);
      assert.deepEqual(res.body.data.links, full().links);
      assert.equal(res.body.data.bio, '## 소개\n안녕하세요');
    });

    it('쿼리 파라미터는 받지 않는다 → 400', async () => {
      await env.publicGet('/profile?foo=1').expect(400);
    });
  });

  describe('PUT /admin/profile 인증·형식', () => {
    it('로그인하지 않으면 401, 로그인해도 Origin이 없으면 403', async () => {
      await request(env.app).put('/api/v1/admin/profile').set('Origin', TEST_ORIGIN).send(minimal()).expect(401);
      await env.agent.put('/api/v1/admin/profile').send(minimal()).expect(403);
    });

    it('JSON이 아닌 본문은 415', async () => {
      await env.agent
        .put('/api/v1/admin/profile')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'text/plain')
        .send('name=x')
        .expect(415);
    });
  });

  describe('PUT /admin/profile 생성·교체', () => {
    it('처음 생성은 201, 응답은 공개 필드 + createdAt (id·_id·singletonKey 없음), 생략한 선택 필드는 기본값', async () => {
      const res = await put(minimal()).expect(201);
      assert.deepEqual(Object.keys(res.body.data).sort(), ADMIN_KEYS);
      assert.deepEqual(
        [res.body.data.bio, res.body.data.email, res.body.data.avatarUrl, res.body.data.resumeUrl],
        [null, null, null, null],
      );
      assert.deepEqual([res.body.data.goals, res.body.data.links], [[], []]);
      assert.ok(Date.parse(res.body.data.createdAt) > 0);
    });

    it('기존 프로필 교체는 200, 문서는 1개, createdAt 유지·updatedAt 갱신', async () => {
      const first = (await put(full()).expect(201)).body.data;
      await new Promise((resolve) => setTimeout(resolve, 10));
      const second = (await put(minimal({ name: '김개발' })).expect(200)).body.data;

      assert.equal(second.name, '김개발');
      assert.equal(second.createdAt, first.createdAt);
      assert.ok(Date.parse(second.updatedAt) > Date.parse(first.updatedAt));
      assert.equal(await Profile.countDocuments(), 1);
    });

    it('전체 교체: 생략한 선택 필드는 기존 값을 유지하지 않고 기본값으로 초기화한다', async () => {
      await put(full()).expect(201);
      const replaced = (await put(minimal()).expect(200)).body.data;
      assert.equal(replaced.bio, null);
      assert.equal(replaced.email, null);
      assert.equal(replaced.avatarUrl, null);
      assert.equal(replaced.resumeUrl, null);
      assert.deepEqual(replaced.goals, []);
      assert.deepEqual(replaced.links, []);
      const stored = await Profile.findOne().lean();
      assert.equal(stored.singletonKey, 'default');
      assert.deepEqual(stored.links, []);
    });

    it('이메일: 앞뒤 공백 제거·소문자, 빈 문자열은 null, 형식 오류는 400', async () => {
      assert.equal((await put(minimal({ email: '  Me@Example.COM ' })).expect(201)).body.data.email, 'me@example.com');
      assert.equal((await put(minimal({ email: '   ' })).expect(200)).body.data.email, null);
      const invalid = await put(minimal({ email: 'not-an-email' })).expect(400);
      assert.equal(invalid.body.error.details[0].field, 'email');
    });

    it('동시에 처음 생성해도 문서는 1개이고, 201은 한 번만 (unique 인덱스가 있는 경우)', async () => {
      const responses = await Promise.all(
        Array.from({ length: 5 }, (_, i) => put(minimal({ name: `동시 ${i}` }))),
      );
      const statuses = responses.map((res) => res.status).sort();
      assert.deepEqual(statuses, [200, 200, 200, 200, 201]);
      assert.equal(await Profile.countDocuments(), 1);
    });
  });

  describe('PUT /admin/profile 입력 검증 (400)', () => {
    const cases = [
      ['name 누락', { headline: '웹 개발자' }, 'name'],
      ['headline 누락', { name: '홍길동' }, 'headline'],
      ['singletonKey 전송', minimal({ singletonKey: 'default' }), 'singletonKey'],
      ['id 전송', minimal({ id: '0123456789abcdef01234567' }), 'id'],
      ['createdAt 전송', minimal({ createdAt: '2026-01-01' }), 'createdAt'],
      ['updatedAt 전송', minimal({ updatedAt: '2026-01-01' }), 'updatedAt'],
      ['name 51자', minimal({ name: 'x'.repeat(51) }), 'name'],
      ['bio 3001자', minimal({ bio: 'x'.repeat(3001) }), 'bio'],
      ['goals 11개', minimal({ goals: Array.from({ length: 11 }, (_, i) => `목표 ${i}`) }), 'goals'],
      ['빈 목표', minimal({ goals: ['   '] }), 'goals.0'],
      ['http 아바타', minimal({ avatarUrl: 'http://example.com/a.png' }), 'avatarUrl'],
      ['링크 type 오류', minimal({ links: [{ type: 'twitter', label: 'X', url: 'https://x.com' }] }), 'links.0.type'],
      ['링크 http URL', minimal({ links: [{ type: 'github', label: 'GH', url: 'http://github.com' }] }), 'links.0.url'],
      ['링크 정의되지 않은 키', minimal({ links: [{ type: 'blog', label: 'B', url: 'https://b.com', icon: 'x' }] }), 'links.0.icon'],
      ['링크 label 누락', minimal({ links: [{ type: 'blog', url: 'https://b.com' }] }), 'links.0.label'],
      [
        '링크 11개',
        minimal({ links: Array.from({ length: 11 }, (_, i) => ({ type: 'other', label: `L${i}`, url: 'https://e.com' })) }),
        'links',
      ],
    ];

    for (const [title, body, field] of cases) {
      it(title, async () => {
        const res = await put(body).expect(400);
        assert.equal(res.body.error.code, 'VALIDATION_ERROR');
        assert.ok(
          res.body.error.details.some((detail) => detail.field === field),
          `${field} 오류가 있어야 한다: ${JSON.stringify(res.body.error.details)}`,
        );
        assert.equal(await Profile.countDocuments(), 0, '검증 실패 시 저장하지 않는다');
      });
    }
  });

  describe('공개 GET 요청 제한', () => {
    it('/profile도 공개 콘텐츠 GET 1분 120회 제한에 포함된다', async () => {
      const app = createApp(testAppConfig, { logger: silentLogger });
      for (let i = 0; i < 120; i += 1) {
        const res = await request(app).get(i % 2 === 0 ? '/api/v1/profile' : '/api/v1/skills');
        assert.notEqual(res.status, 429);
      }
      const limited = await request(app).get('/api/v1/profile').expect(429);
      assert.equal(limited.body.error.code, 'RATE_LIMITED');
    });
  });
});
