import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FORM_TOKEN_MAX_AGE_MS,
  FORM_TOKEN_MIN_AGE_MS,
  issueFormToken,
  verifyFormToken,
} from '../../src/modules/inquiries/formToken.js';
import {
  computeContentHash,
  countUrls,
  isHoneypotFilled,
  normalizeMessage,
} from '../../src/modules/inquiries/spamGuard.js';

const SECRET = 'unit-test-form-token-secret-'.padEnd(40, 'z');
const NOW = Date.parse('2026-10-16T03:00:00.000Z');

describe('formToken', () => {
  const issued = issueFormToken(SECRET, NOW);

  it('발급: 토큰·발급 시각·1시간 뒤 만료 시각', () => {
    assert.match(issued.formToken, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.equal(issued.issuedAt, NOW);
    assert.equal(issued.expiresAt.getTime(), NOW + FORM_TOKEN_MAX_AGE_MS);
    assert.notEqual(issueFormToken(SECRET, NOW).formToken, issued.formToken, '같은 시각이어도 무작위 값으로 달라진다');
  });

  it('3초 이상 1시간 이내면 valid (경계 포함)', () => {
    assert.equal(verifyFormToken(issued.formToken, SECRET, NOW + FORM_TOKEN_MIN_AGE_MS), 'valid');
    assert.equal(verifyFormToken(issued.formToken, SECRET, NOW + 10 * 60 * 1000), 'valid');
    assert.equal(verifyFormToken(issued.formToken, SECRET, NOW + FORM_TOKEN_MAX_AGE_MS), 'valid');
  });

  it('3초 미만이면 too-fast', () => {
    assert.equal(verifyFormToken(issued.formToken, SECRET, NOW), 'too-fast');
    assert.equal(verifyFormToken(issued.formToken, SECRET, NOW + FORM_TOKEN_MIN_AGE_MS - 1), 'too-fast');
  });

  it('1시간을 넘으면 expired', () => {
    assert.equal(verifyFormToken(issued.formToken, SECRET, NOW + FORM_TOKEN_MAX_AGE_MS + 1), 'expired');
  });

  it('위조·다른 비밀키·형식 오류·미래 발급 시각은 invalid', () => {
    const [payload, signature] = issued.formToken.split('.');
    const later = NOW + 10_000;
    const forgedPayload = Buffer.from(JSON.stringify({ t: NOW - 60_000, n: 'x' })).toString('base64url');
    for (const token of [
      `${forgedPayload}.${signature}`, // 발급 시각을 바꾼 위조
      `${payload}.${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`, // 서명 변조
      `${payload}.`,
      `.${signature}`,
      'not-a-token',
      `${payload}.${signature}.extra`,
      '',
      'x'.repeat(600),
      null,
      12345,
    ]) {
      assert.equal(verifyFormToken(token, SECRET, later), 'invalid', String(token).slice(0, 40));
    }
    assert.equal(verifyFormToken(issued.formToken, 'another-secret-'.padEnd(40, 'q'), later), 'invalid');
    const future = issueFormToken(SECRET, NOW + 60_000);
    assert.equal(verifyFormToken(future.formToken, SECRET, NOW), 'invalid', '미래 발급 시각');
  });

  it('서명이 맞아도 발급 시각이 숫자가 아니면 invalid', async () => {
    const { createHmac } = await import('node:crypto');
    const payload = Buffer.from(JSON.stringify({ t: 'yesterday' })).toString('base64url');
    const signature = createHmac('sha256', SECRET).update(payload).digest('base64url');
    assert.equal(verifyFormToken(`${payload}.${signature}`, SECRET, NOW), 'invalid');
  });
});

describe('spamGuard', () => {
  it('countUrls: http://, https://, www.로 시작하는 것만 센다', () => {
    assert.equal(countUrls('https://a.com http://b.com www.c.com'), 3);
    assert.equal(countUrls('https://www.example.com/path'), 1, 'https://www.는 한 번');
    assert.equal(countUrls('example.com test.io a.co.kr'), 0, '접두어 없는 도메인은 세지 않음');
    assert.equal(countUrls('HTTPS://A.COM WWW.B.COM'), 2, '대소문자 무시');
    assert.equal(countUrls('줄바꿈\nhttps://a.com\nhttps://b.com'), 2);
    assert.equal(countUrls('일반 문장입니다.'), 0);
  });

  it('isHoneypotFilled: 생략·null·빈 문자열만 비어 있음', () => {
    for (const empty of [undefined, null, '']) assert.equal(isHoneypotFilled(empty), false);
    for (const filled of ['x', ' ', 'https://spam', 0, false, {}]) assert.equal(isHoneypotFilled(filled), true, String(filled));
  });

  it('normalizeMessage: 앞뒤 공백 제거, 줄바꿈 포함 연속 공백을 한 칸으로', () => {
    assert.equal(normalizeMessage('  안녕하세요\n\n  반갑습니다\t!  '), '안녕하세요 반갑습니다 !');
  });

  it('computeContentHash: 이메일 대소문자·메시지 공백 차이는 같은 해시, 내용이 다르면 다른 해시', () => {
    const base = computeContentHash('me@example.com', '협업 문의 드립니다');
    assert.match(base, /^[0-9a-f]{64}$/);
    assert.equal(computeContentHash('ME@Example.com', '  협업   문의\n드립니다 '), base);
    assert.notEqual(computeContentHash('me@example.com', '협업 문의 드립니다!'), base);
    assert.notEqual(computeContentHash('you@example.com', '협업 문의 드립니다'), base);
  });
});
