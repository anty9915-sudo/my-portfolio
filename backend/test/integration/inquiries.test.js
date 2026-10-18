import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { CURRENT_CONSENT_VERSION } from '../../src/modules/inquiries/consent.js';
import { issueFormToken, verifyFormToken } from '../../src/modules/inquiries/formToken.js';
import { Inquiry, INQUIRY_RETENTION_MS } from '../../src/modules/inquiries/inquiry.model.js';
import { TEST_ORIGIN, testAppConfig } from '../helpers/config.js';
import { MISSING_ID, SETUP_TIMEOUT_MS, startContentTestEnv } from '../helpers/content.js';

const RECEIVED = { success: true, data: { received: true } };
const STORED_KEYS = [
  '_id', 'adminMemo', 'consent', 'contentHash', 'createdAt', 'email', 'expiresAt',
  'message', 'name', 'readAt', 'repliedAt', 'status', 'subject', 'updatedAt',
].sort();

/** 발급 시각을 과거로 돌린 진짜 서명 토큰 (테스트에서 3초를 기다리지 않기 위해) */
const tokenIssuedAgo = (ms) => issueFormToken(testAppConfig.formTokenSecret, Date.now() - ms).formToken;

let messageCounter = 0;
function validBody(overrides = {}) {
  messageCounter += 1;
  return {
    name: '김방문',
    email: 'Visitor@Example.com',
    subject: '협업 문의',
    message: `포트폴리오 잘 봤습니다. 이야기 나누고 싶습니다. (${messageCounter})`,
    consent: true,
    consentVersion: CURRENT_CONSENT_VERSION,
    formToken: tokenIssuedAgo(10_000),
    website: '',
    ...overrides,
  };
}

describe('문의 폼', () => {
  let env;

  before(async () => {
    env = await startContentTestEnv();
    await Inquiry.init(); // 테스트 DB에 문의 인덱스(TTL 포함) 생성
  }, { timeout: SETUP_TIMEOUT_MS });

  after(async () => env?.stop());
  beforeEach(async () => Inquiry.deleteMany({}));

  /** 빈도 제한 카운터가 독립된 새 앱 + 로그 수집 */
  function freshApp() {
    const logs = [];
    const app = createApp(testAppConfig, { logger: { error() {}, info: (message) => logs.push(message) } });
    const post = (body) => request(app).post('/api/v1/inquiries').set('Origin', TEST_ORIGIN).send(body);
    return { app, logs, post };
  }

  describe('GET /inquiries/form-token', () => {
    it('서명된 토큰, 현재 동의 버전, 1시간 뒤 만료 시각을 반환하고 캐시하지 않는다', async () => {
      const res = await request(freshApp().app).get('/api/v1/inquiries/form-token').expect(200);
      const { formToken, consentVersion, expiresAt } = res.body.data;
      assert.equal(consentVersion, '2026-10-01');
      assert.ok(Math.abs(Date.parse(expiresAt) - (Date.now() + 60 * 60 * 1000)) < 5_000);
      assert.equal(res.headers['cache-control'], 'no-store');
      assert.equal(verifyFormToken(formToken, testAppConfig.formTokenSecret, Date.now() + 5_000), 'valid');
      assert.equal(await Inquiry.countDocuments(), 0, '토큰은 DB에 저장하지 않는다');
    });

    it('쿼리 파라미터는 400, IP당 10분 20회를 넘으면 429', async () => {
      const { app } = freshApp();
      await request(app).get('/api/v1/inquiries/form-token?foo=1').expect(400); // 1회
      for (let i = 0; i < 19; i += 1) await request(app).get('/api/v1/inquiries/form-token').expect(200);
      const limited = await request(app).get('/api/v1/inquiries/form-token').expect(429);
      assert.equal(limited.body.error.code, 'RATE_LIMITED');
    });
  });

  describe('POST /inquiries 정상 접수', () => {
    it('202 { received: true }, ID를 반환하지 않는다', async () => {
      const res = await freshApp().post(validBody()).expect(202);
      assert.deepEqual(res.body, RECEIVED);
    });

    it('저장 필드: IP·User-Agent·허니팟·토큰은 저장하지 않고, 이메일 소문자, 180일 뒤 만료', async () => {
      const body = validBody({ subject: '' });
      await freshApp()
        .post(body)
        .set('User-Agent', 'Mozilla/5.0 test-agent')
        .expect(202);

      const stored = await Inquiry.findOne().lean();
      assert.deepEqual(Object.keys(stored).sort(), STORED_KEYS);
      const serialized = JSON.stringify(stored);
      for (const forbidden of ['127.0.0.1', '::ffff', 'test-agent', 'website', body.formToken]) {
        assert.ok(!serialized.includes(forbidden), `${forbidden}이 저장되면 안 된다`);
      }
      assert.equal(stored.email, 'visitor@example.com');
      assert.equal(stored.subject, null);
      assert.equal(stored.status, 'new');
      assert.deepEqual(Object.keys(stored.consent).sort(), ['agreed', 'agreedAt', 'version']);
      assert.equal(stored.consent.agreed, true);
      assert.equal(stored.consent.version, '2026-10-01');
      assert.match(stored.contentHash, /^[0-9a-f]{64}$/);
      assert.equal(stored.expiresAt.getTime() - stored.createdAt.getTime(), INQUIRY_RETENTION_MS);
      assert.equal(stored.consent.agreedAt.getTime(), stored.createdAt.getTime());
    });

    it('메시지에 URL 3개까지, 접두어 없는 도메인, 메시지 밖의 URL은 허용', async () => {
      const { post } = freshApp();
      await post(validBody({ message: '참고: https://a.com http://b.com www.c.com 입니다' })).expect(202);
      await post(validBody({ message: 'a.com b.com c.com d.com e.com 도메인만 적었습니다' })).expect(202);
      await post(validBody({ subject: 'https://a.co https://b.co https://c.co https://d.co' })).expect(202);
      assert.equal(await Inquiry.countDocuments(), 3);
    });
  });

  describe('POST /inquiries 조용한 거부 (202, 저장 안 함, 응답 동일)', () => {
    it('허니팟에 값이 있으면 다른 필드가 틀려도 202, 저장하지 않는다', async () => {
      const { post } = freshApp();
      const filled = await post(validBody({ website: 'https://spam.example' })).expect(202);
      const filledAndInvalid = await post({ website: 'x', message: '짧음' }).expect(202);
      assert.deepEqual(filled.body, RECEIVED);
      assert.deepEqual(filledAndInvalid.body, RECEIVED);
      assert.equal(await Inquiry.countDocuments(), 0);
    });

    it('토큰 발급 후 3초 미만이면 202, 저장하지 않는다', async () => {
      const res = await freshApp().post(validBody({ formToken: tokenIssuedAgo(1_000) })).expect(202);
      assert.deepEqual(res.body, RECEIVED);
      assert.equal(await Inquiry.countDocuments(), 0);
    });

    it('24시간 안에 같은 이메일·내용(대소문자·공백 차이 무시)이면 202, 새로 저장하지 않는다', async () => {
      const { post } = freshApp();
      await post(validBody({ email: 'same@example.com', message: '같은 내용의 문의입니다' })).expect(202);
      const duplicate = await post(
        validBody({ email: 'SAME@example.com ', message: '  같은   내용의\n문의입니다 ', name: '다른 이름' }),
      ).expect(202);
      assert.deepEqual(duplicate.body, RECEIVED);
      assert.equal(await Inquiry.countDocuments(), 1);
    });

    it('24시간이 지난 같은 내용은 다시 저장한다', async () => {
      const { post } = freshApp();
      await post(validBody({ email: 'old@example.com', message: '하루 전에 보낸 문의입니다' })).expect(202);
      // Mongoose는 timestamps의 createdAt 수정을 막으므로 드라이버 컬렉션으로 직접 과거로 돌린다
      await Inquiry.collection.updateMany({}, { $set: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) } });
      await post(validBody({ email: 'old@example.com', message: '하루 전에 보낸 문의입니다' })).expect(202);
      assert.equal(await Inquiry.countDocuments(), 2);
    });

    it('정상 접수와 조용한 거부의 상태 코드·본문이 완전히 같다', async () => {
      const results = [];
      results.push(await freshApp().post(validBody()));
      results.push(await freshApp().post(validBody({ website: 'bot' })));
      results.push(await freshApp().post(validBody({ formToken: tokenIssuedAgo(0) })));
      const { post } = freshApp();
      const original = validBody({ message: '중복 확인용 메시지입니다' });
      await post(original);
      results.push(await post({ ...original, formToken: tokenIssuedAgo(10_000) }));
      for (const res of results) {
        assert.equal(res.status, 202);
        assert.deepEqual(res.body, RECEIVED);
      }
    });

    it('조용한 거부 로그에는 사유와 건수만 남고 IP·이메일·내용은 없다', async () => {
      const { post, logs } = freshApp();
      await post(validBody({ website: 'bot', email: 'spammer@example.com', message: '스팸 메시지 본문입니다' }));
      await post(validBody({ formToken: tokenIssuedAgo(0), email: 'fast@example.com' }));
      assert.deepEqual(logs, ['[inquiries] 조용한 거부: honeypot (누적 1건)', '[inquiries] 조용한 거부: too-fast (누적 1건)']);
      for (const forbidden of ['spammer@example.com', '스팸 메시지', 'fast@example.com', '127.0.0.1', '::ffff']) {
        assert.ok(!logs.join('\n').includes(forbidden), forbidden);
      }
    });
  });

  describe('POST /inquiries 거부 (400)', () => {
    const cases = [
      ['이름 누락', { name: undefined }, 'name'],
      ['이름 51자', { name: 'x'.repeat(51) }, 'name'],
      ['이메일 형식 오류', { email: 'not-an-email' }, 'email'],
      ['메시지 10자 미만', { message: '짧은 메시지' }, 'message'],
      ['메시지 3001자', { message: 'x'.repeat(3001) }, 'message'],
      ['메시지 URL 4개', { message: 'https://a.com https://b.com http://c.com www.d.com 확인 부탁드립니다' }, 'message'],
      ['동의하지 않음', { consent: false }, 'consent'],
      ['동의 누락', { consent: undefined }, 'consent'],
      ['동의 버전 불일치', { consentVersion: '2025-01-01' }, 'consentVersion'],
      ['토큰 누락', { formToken: undefined }, 'formToken'],
      ['정의되지 않은 필드', { phone: '010-0000-0000' }, 'phone'],
    ];

    for (const [title, overrides, field] of cases) {
      it(title, async () => {
        const body = validBody(overrides);
        for (const key of Object.keys(overrides)) if (overrides[key] === undefined) delete body[key];
        const res = await freshApp().post(body).expect(400);
        assert.equal(res.body.error.code, 'VALIDATION_ERROR');
        assert.ok(res.body.error.details.some((detail) => detail.field === field), JSON.stringify(res.body.error.details));
        assert.equal(await Inquiry.countDocuments(), 0);
      });
    }

    it('위조·다른 비밀키·만료 토큰은 400 (field: formToken)', async () => {
      const valid = tokenIssuedAgo(10_000);
      const [payload, signature] = valid.split('.');
      const tokens = [
        `${payload}.${signature.slice(0, -2)}xx`,
        issueFormToken('another-secret-'.padEnd(40, 'q'), Date.now() - 10_000).formToken,
        tokenIssuedAgo(61 * 60 * 1000),
        'garbage',
      ];
      for (const formToken of tokens) {
        const res = await freshApp().post(validBody({ formToken })).expect(400);
        assert.equal(res.body.error.details[0].field, 'formToken');
      }
      assert.equal(await Inquiry.countDocuments(), 0);
    });

    it('Origin이 없으면 403', async () => {
      await request(freshApp().app).post('/api/v1/inquiries').send(validBody()).expect(403);
    });
  });

  describe('POST /inquiries 빈도 제한', () => {
    it('10분에 3회: 검증 실패·조용한 거부도 시도로 세고, 4번째는 429 (저장 안 함)', async () => {
      const { post } = freshApp();
      await post(validBody({ website: 'bot' })).expect(202); // 조용한 거부
      await post(validBody({ consent: false })).expect(400); // 검증 실패
      await post(validBody()).expect(202); // 정상
      const limited = await post(validBody()).expect(429);
      assert.equal(limited.body.error.code, 'RATE_LIMITED');
      const retryAfter = Number(limited.headers['retry-after']);
      assert.ok(retryAfter > 0 && retryAfter <= 600);
      assert.equal(await Inquiry.countDocuments(), 1);
    });

    it('24시간에 10회: 10분 제한에 걸린 시도도 하루 카운트에 포함되어 11번째는 하루 제한으로 429', async () => {
      const { post } = freshApp();
      for (let i = 0; i < 3; i += 1) await post(validBody({ website: 'bot' })).expect(202);
      for (let i = 0; i < 7; i += 1) {
        const res = await post(validBody()).expect(429); // 4~10번째: 10분 제한
        assert.ok(Number(res.headers['retry-after']) <= 600);
      }
      const daily = await post(validBody()).expect(429); // 11번째: 24시간 제한
      assert.ok(Number(daily.headers['retry-after']) > 600, '하루 제한의 Retry-After');
    });
  });

  describe('관리자 API', () => {
    async function seed(overrides = {}) {
      const createdAt = overrides.createdAt ?? new Date();
      return Inquiry.create({
        name: '방문자',
        email: 'visitor@example.com',
        subject: '제목',
        message: '관리자 화면 테스트용 문의 내용입니다.',
        consent: { agreed: true, version: CURRENT_CONSENT_VERSION, agreedAt: createdAt },
        contentHash: 'a'.repeat(64),
        expiresAt: new Date(createdAt.getTime() + INQUIRY_RETENTION_MS),
        ...overrides,
        createdAt,
      });
    }

    it('로그인하지 않으면 4개 API 모두 401', async () => {
      await env.anonymous.get('/inquiries').expect(401);
      await env.anonymous.get(`/inquiries/${MISSING_ID}`).expect(401);
      await env.anonymous.patch(`/inquiries/${MISSING_ID}`, { status: 'read' }).expect(401);
      await env.anonymous.delete(`/inquiries/${MISSING_ID}`).expect(401);
    });

    it('목록: 11.1 필드만, 최신순, messagePreview는 이모지를 자르지 않고 100자', async () => {
      await seed({ message: `${'가'.repeat(99)}😀뒤쪽 내용`, createdAt: new Date('2026-10-01T00:00:00Z') });
      await seed({ name: '최근', createdAt: new Date('2026-10-10T00:00:00Z') });
      const res = await env.admin.get('/inquiries').expect(200);
      assert.deepEqual(res.body.data.map((item) => item.name), ['최근', '방문자']);
      assert.deepEqual(Object.keys(res.body.data[0]).sort(), [
        'createdAt', 'email', 'expiresAt', 'id', 'messagePreview', 'name', 'status', 'subject',
      ]);
      assert.equal(res.body.data[1].messagePreview, `${'가'.repeat(99)}😀`);
      assert.deepEqual(res.body.meta, { page: 1, limit: 10, totalItems: 2, totalPages: 1, hasNext: false });
    });

    it('목록 검색·필터·정렬: q(이름·이메일·제목), status, from·to(KST), sort=createdAt', async () => {
      await seed({ name: '홍길동', createdAt: new Date('2026-09-30T14:59:59Z') }); // KST 9/30 23:59:59
      await seed({ email: 'partner@corp.com', status: 'read', createdAt: new Date('2026-09-30T15:00:00Z') }); // KST 10/1 00:00
      await seed({ subject: '채용 제안', status: 'replied', createdAt: new Date('2026-10-02T00:00:00Z') });
      await seed({ message: '본문에만 홍길동이 있는 문의입니다.', createdAt: new Date('2026-10-03T00:00:00Z') });

      const names = async (query) => (await env.admin.get(`/inquiries?${query}`).expect(200)).body.data.length;
      assert.equal(await names(`q=${encodeURIComponent('홍길동')}`), 1, '본문은 검색하지 않는다');
      assert.equal(await names('q=CORP.COM'), 1);
      assert.equal(await names(`q=${encodeURIComponent('채용')}`), 1);
      assert.equal(await names('status=read'), 1);
      assert.equal(await names('from=2026-10-01&to=2026-10-01'), 1, 'KST 10/1 하루');
      assert.equal(await names('to=2026-09-30'), 1);
      const ascending = await env.admin.get('/inquiries?sort=createdAt').expect(200);
      assert.equal(ascending.body.data[0].name, '홍길동');
      for (const query of ['status=spam', 'sort=name', 'foo=1', 'from=2026-10-02&to=2026-10-01']) {
        await env.admin.get(`/inquiries?${query}`).expect(400);
      }
    });

    it('상세: 11.2 필드, contentHash 없음, 조회해도 status는 그대로', async () => {
      const inquiry = await seed();
      const res = await env.admin.get(`/inquiries/${inquiry.id}`).expect(200);
      assert.deepEqual(Object.keys(res.body.data).sort(), [
        'adminMemo', 'consent', 'createdAt', 'email', 'expiresAt', 'id', 'message', 'messagePreview',
        'name', 'readAt', 'repliedAt', 'status', 'subject', 'updatedAt',
      ]);
      assert.deepEqual(Object.keys(res.body.data.consent).sort(), ['agreedAt', 'version']);
      assert.equal(res.body.data.status, 'new');
      assert.equal((await Inquiry.findById(inquiry.id)).status, 'new');
      await env.admin.get('/inquiries/bad-id').expect(400);
      await env.admin.get(`/inquiries/${MISSING_ID}`).expect(404);
    });

    it('PATCH: read → readAt, replied → repliedAt(+비어 있으면 readAt), archived·new는 시각 유지', async () => {
      const a = await seed();
      const read = (await env.admin.patch(`/inquiries/${a.id}`, { status: 'read' }).expect(200)).body.data;
      assert.ok(read.readAt);
      assert.equal(read.repliedAt, null);
      const replied = (await env.admin.patch(`/inquiries/${a.id}`, { status: 'replied' }).expect(200)).body.data;
      assert.equal(replied.readAt, read.readAt, '이미 있는 readAt은 유지');
      assert.ok(replied.repliedAt);
      const archived = (await env.admin.patch(`/inquiries/${a.id}`, { status: 'archived' }).expect(200)).body.data;
      assert.deepEqual([archived.readAt, archived.repliedAt], [replied.readAt, replied.repliedAt]);
      const reopened = (await env.admin.patch(`/inquiries/${a.id}`, { status: 'new' }).expect(200)).body.data;
      assert.deepEqual([reopened.readAt, reopened.repliedAt], [replied.readAt, replied.repliedAt]);

      const b = await seed();
      const directReply = (await env.admin.patch(`/inquiries/${b.id}`, { status: 'replied' }).expect(200)).body.data;
      assert.ok(directReply.readAt && directReply.repliedAt, 'new → replied면 readAt도 기록');

      const c = await seed();
      const archivedOnly = (await env.admin.patch(`/inquiries/${c.id}`, { status: 'archived' }).expect(200)).body.data;
      assert.deepEqual([archivedOnly.readAt, archivedOnly.repliedAt], [null, null]);
    });

    it('PATCH: adminMemo 설정·삭제, 다른 필드·빈 본문·잘못된 값은 400', async () => {
      const inquiry = await seed();
      const memo = (await env.admin.patch(`/inquiries/${inquiry.id}`, { adminMemo: '회신 완료' }).expect(200)).body.data;
      assert.equal(memo.adminMemo, '회신 완료');
      assert.equal(memo.status, 'new');
      assert.equal((await env.admin.patch(`/inquiries/${inquiry.id}`, { adminMemo: null }).expect(200)).body.data.adminMemo, null);
      for (const body of [{}, { message: '수정' }, { email: 'a@b.com' }, { readAt: '2026-10-01' }, { status: 'spam' }, { status: null }]) {
        await env.admin.patch(`/inquiries/${inquiry.id}`, body).expect(400);
      }
      await env.admin.patch(`/inquiries/${MISSING_ID}`, { status: 'read' }).expect(404);
    });

    it('DELETE: 즉시 물리 삭제 204, 이후 404', async () => {
      const inquiry = await seed();
      await env.admin.delete(`/inquiries/${inquiry.id}`).expect(204);
      assert.equal(await Inquiry.countDocuments(), 0);
      await env.admin.delete(`/inquiries/${inquiry.id}`).expect(404);
      await env.admin.delete('/inquiries/xyz').expect(400);
    });
  });

  describe('TTL 인덱스', () => {
    it('inquiries_ttl: expiresAt 기준 expireAfterSeconds 0', async () => {
      const ttl = (await Inquiry.collection.indexes()).find((index) => index.name === 'inquiries_ttl');
      assert.deepEqual(ttl.key, { expiresAt: 1 });
      assert.equal(ttl.expireAfterSeconds, 0);
    });
  });
});
