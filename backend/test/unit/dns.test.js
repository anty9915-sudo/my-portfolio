import assert from 'node:assert/strict';
import dns from 'node:dns';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { applyDnsServers } from '../../src/config/dns.js';

// 문서용 예약 주소 (RFC 5737). 실제로 질의를 보내지 않는다.
const DOC_DNS_A = '192.0.2.53';
const DOC_DNS_B = '198.51.100.53';

describe('applyDnsServers', () => {
  it('설정이 없으면(null) 아무것도 바꾸지 않는다', () => {
    const calls = [];
    assert.equal(applyDnsServers(null, { setServers: (s) => calls.push(s) }), false);
    assert.deepEqual(calls, []);
  });

  it('빈 목록이면 아무것도 바꾸지 않는다', () => {
    const calls = [];
    assert.equal(applyDnsServers([], { setServers: (s) => calls.push(s) }), false);
    assert.deepEqual(calls, []);
  });

  it('목록이 있으면 그대로 setServers에 전달한다', () => {
    const calls = [];
    const servers = Object.freeze([DOC_DNS_A, DOC_DNS_B]);
    assert.equal(applyDnsServers(servers, { setServers: (s) => calls.push(s) }), true);
    assert.deepEqual(calls, [[DOC_DNS_A, DOC_DNS_B]]);
  });
});

describe('applyDnsServers (실제 Node 리졸버)', () => {
  let original;

  beforeEach(() => {
    original = dns.getServers();
  });

  afterEach(() => {
    dns.setServers(original);
  });

  it('기본 리졸버와 promises 리졸버(MongoDB 드라이버가 SRV 조회에 사용)에 모두 적용된다', () => {
    applyDnsServers([DOC_DNS_A]);
    assert.deepEqual(dns.getServers(), [DOC_DNS_A]);
    assert.deepEqual(dns.promises.getServers(), [DOC_DNS_A]);
  });

  it('설정이 없으면 기존 DNS 서버 목록이 그대로 유지된다', () => {
    applyDnsServers(null);
    assert.deepEqual(dns.getServers(), original);
  });
});
