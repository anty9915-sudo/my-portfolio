export const TEST_ORIGIN = 'http://localhost:5173';

/** createApp()에 넘길 최소 설정 (테스트 전용 값, 실제 비밀값 아님) */
export const testAppConfig = Object.freeze({
  clientOrigin: TEST_ORIGIN,
  trustProxy: false,
  sessionSecret: 'test-session-secret-'.padEnd(40, 'x'),
  formTokenSecret: 'test-form-token-secret-'.padEnd(40, 'y'),
  visitHashSecret: 'test-visit-hash-secret-'.padEnd(40, 'w'),
  isProduction: false,
});

/** loadEnv() 테스트용 유효한 환경변수 (실제 비밀값 아님) */
export function validEnvSource(overrides = {}) {
  return {
    NODE_ENV: 'test',
    PORT: '3000',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/portfolio_test',
    CLIENT_ORIGIN: TEST_ORIGIN,
    SESSION_SECRET: 's'.repeat(32),
    VISIT_HASH_SECRET: 'v'.repeat(32),
    FORM_TOKEN_SECRET: 'f'.repeat(32),
    TRUST_PROXY: 'false',
    ...overrides,
  };
}
