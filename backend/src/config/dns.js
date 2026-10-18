import dns from 'node:dns';

/**
 * DNS_SERVERS가 설정된 경우에만 Node 기본 리졸버의 DNS 서버를 바꾼다.
 *
 * Windows 일부 환경에서 Node(c-ares)가 OS의 DNS 설정을 읽지 못하고 127.0.0.1을
 * 사용해 Atlas `mongodb+srv` 주소의 SRV 조회가 실패한다 (querySrv ECONNREFUSED).
 * MongoDB 드라이버의 SRV·TXT 조회는 기본 리졸버를 쓰므로, 연결 전에 호출하면 적용된다.
 * 일반 호스트 조회(dns.lookup)는 OS 경로를 그대로 사용한다.
 *
 * @param {readonly string[] | null} servers 검증된 IP 목록. null이면 아무것도 바꾸지 않는다.
 * @param {{ setServers?: (servers: string[]) => void }} [deps] 테스트용
 * @returns {boolean} 적용했으면 true
 */
export function applyDnsServers(servers, { setServers = dns.setServers } = {}) {
  if (!servers || servers.length === 0) return false;
  setServers([...servers]);
  return true;
}
