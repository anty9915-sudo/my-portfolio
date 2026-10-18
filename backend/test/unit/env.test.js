import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EnvValidationError, loadEnv, parseDnsServers, parseTrustProxy } from '../../src/config/env.js';
import { validEnvSource } from '../helpers/config.js';

function issuesOf(source) {
  try {
    loadEnv(source);
  } catch (error) {
    assert.ok(error instanceof EnvValidationError);
    return error.issues;
  }
  assert.fail('EnvValidationError가 발생해야 합니다.');
}

describe('loadEnv', () => {
  it('유효한 환경변수로 설정 객체를 만든다', () => {
    const env = loadEnv(validEnvSource());
    assert.equal(env.nodeEnv, 'test');
    assert.equal(env.isTest, true);
    assert.equal(env.isProduction, false);
    assert.equal(env.port, 3000);
    assert.equal(env.clientOrigin, 'http://localhost:5173');
    assert.equal(env.trustProxy, false);
    assert.ok(Object.isFrozen(env));
  });

  it('빈 PORT·TRUST_PROXY는 기본값을 쓴다', () => {
    const env = loadEnv(validEnvSource({ PORT: '', TRUST_PROXY: '' }));
    assert.equal(env.port, 3000);
    assert.equal(env.trustProxy, false);
  });

  it('필수 변수가 없으면 변수 이름을 모두 알려 준다', () => {
    const issues = issuesOf({ NODE_ENV: 'test' });
    const names = issues.map((issue) => issue.variable).sort();
    assert.deepEqual(names, [
      'CLIENT_ORIGIN',
      'FORM_TOKEN_SECRET',
      'MONGODB_URI',
      'SESSION_SECRET',
      'VISIT_HASH_SECRET',
    ]);
    assert.ok(issues.every((issue) => issue.reason === '값이 필요합니다.'));
  });

  it('오류에 비밀값이나 연결 문자열을 담지 않는다', () => {
    const source = validEnvSource({
      MONGODB_URI: 'postgres://user:topsecret@host/db',
      SESSION_SECRET: 'short-secret-value',
    });
    const issues = issuesOf(source);
    const serialized = JSON.stringify(issues);
    assert.ok(!serialized.includes('topsecret'));
    assert.ok(!serialized.includes('short-secret-value'));
  });

  it('CLIENT_ORIGIN은 경로·끝 슬래시가 없는 origin이어야 한다', () => {
    for (const bad of ['http://localhost:5173/', 'https://example.com/app', 'example.com', 'ftp://example.com']) {
      const issues = issuesOf(validEnvSource({ CLIENT_ORIGIN: bad }));
      assert.deepEqual(issues.map((issue) => issue.variable), ['CLIENT_ORIGIN'], bad);
    }
  });

  it('비밀값 3개는 서로 달라야 한다', () => {
    const same = 'x'.repeat(40);
    const issues = issuesOf(validEnvSource({ SESSION_SECRET: same, FORM_TOKEN_SECRET: same }));
    assert.deepEqual(issues.map((issue) => issue.variable), ['FORM_TOKEN_SECRET']);
  });

  it('비밀값은 32자 이상이어야 한다', () => {
    const issues = issuesOf(validEnvSource({ VISIT_HASH_SECRET: 'x'.repeat(31) }));
    assert.deepEqual(issues.map((issue) => issue.variable), ['VISIT_HASH_SECRET']);
  });

  it('NODE_ENV와 PORT 형식을 검사한다', () => {
    const issues = issuesOf(validEnvSource({ NODE_ENV: 'staging', PORT: '70000' }));
    assert.deepEqual(issues.map((issue) => issue.variable).sort(), ['NODE_ENV', 'PORT']);
  });
});

describe('DNS_SERVERS (선택)', () => {
  it('설정하지 않으면 null (Node 기본 DNS 유지)', () => {
    assert.equal(loadEnv(validEnvSource()).dnsServers, null);
  });

  it('빈 문자열이면 설정하지 않은 것으로 취급한다', () => {
    assert.equal(loadEnv(validEnvSource({ DNS_SERVERS: '' })).dnsServers, null);
  });

  it('쉼표로 구분한 IPv4·IPv6 주소를 공백 없이 목록으로 만든다', () => {
    const env = loadEnv(validEnvSource({ DNS_SERVERS: ' 192.0.2.53 , 2001:db8::53 ' }));
    assert.deepEqual(env.dnsServers, ['192.0.2.53', '2001:db8::53']);
    assert.ok(Object.isFrozen(env.dnsServers));
  });

  for (const bad of ['dns.example.com', '192.0.2.53:53', '300.1.1.1', ' , ', '1.1.1.1,1.0.0.1,8.8.8.8,8.8.4.4,9.9.9.9']) {
    it(`잘못된 값은 거부한다: "${bad}"`, () => {
      const issues = issuesOf(validEnvSource({ DNS_SERVERS: bad }));
      assert.deepEqual(issues.map((issue) => issue.variable), ['DNS_SERVERS']);
      // 오류 사유에 입력값이 섞이지 않는다 (구분자만 있는 값은 비교 의미가 없어 제외)
      if (/[0-9a-z]/i.test(bad)) assert.ok(issues.every((issue) => !issue.reason.includes(bad.trim())));
    });
  }

  it('parseDnsServers는 undefined를 null로 바꾼다', () => {
    assert.equal(parseDnsServers(undefined), null);
    assert.deepEqual(parseDnsServers('1.1.1.1,,8.8.8.8'), ['1.1.1.1', '8.8.8.8']);
  });
});

describe('parseTrustProxy', () => {
  it('false/true/숫자/문자열을 Express 설정값으로 바꾼다', () => {
    assert.equal(parseTrustProxy('false'), false);
    assert.equal(parseTrustProxy('true'), true);
    assert.equal(parseTrustProxy('1'), 1);
    assert.equal(parseTrustProxy('loopback'), 'loopback');
  });
});
