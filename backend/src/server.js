import { createApp } from './app.js';
import { EnvValidationError, loadEnv } from './config/env.js';
import { connectDatabase, disconnectDatabase, redactCredentials } from './config/database.js';
import { applyDnsServers } from './config/dns.js';
import { startRollupScheduler } from './modules/visits/rollupScheduler.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

function loadEnvOrExit() {
  try {
    return loadEnv(process.env);
  } catch (error) {
    if (!(error instanceof EnvValidationError)) throw error;
    console.error('환경변수 검증에 실패해 서버를 시작하지 않습니다. backend/.env.example을 참고하세요.');
    for (const issue of error.issues) console.error(`  - ${issue.variable}: ${issue.reason}`);
    process.exit(1);
  }
}

async function main() {
  const env = loadEnvOrExit();

  if (applyDnsServers(env.dnsServers)) {
    console.log(`DNS_SERVERS 설정 적용: DNS 서버 ${env.dnsServers.length}개 사용`);
  }

  try {
    // 서버 시작만으로 컬렉션·인덱스를 만들지 않는다. 인덱스는 scripts에서 명시적으로 만든다.
    await connectDatabase(env.mongodbUri, { autoIndex: false, autoCreate: false });
  } catch (error) {
    // 연결 실패를 숨기지 않는다 (CLAUDE.md 5.1). 연결 문자열의 계정 정보는 가린다.
    console.error(`MongoDB 연결 실패로 서버를 시작하지 않습니다: ${error.name}: ${redactCredentials(error.message)}`);
    process.exit(1);
  }

  const app = createApp(env);
  const server = app.listen(env.port, () => {
    console.log(`API 서버 시작: http://localhost:${env.port}/api/v1 (${env.nodeEnv})`);
  });

  // 방문 통계 일별 집계: DB 연결 후 한 번 실행하고 이후 1시간마다 실행한다
  const rollupScheduler = startRollupScheduler({ logger: console });

  const shutdown = (signal) => {
    console.log(`${signal} 수신: 서버를 종료합니다.`);
    rollupScheduler.stop();
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('서버 시작 중 예상하지 못한 오류', error);
  process.exit(1);
});
