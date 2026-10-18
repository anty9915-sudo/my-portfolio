import { isIP } from 'node:net';
import { z } from 'zod';

// 환경변수 검증 (CLAUDE.md 7.1). 오류 메시지에는 변수 이름만 담고 값은 절대 담지 않는다.

const SECRET_MIN_LENGTH = 32;
const SECRET_KEYS = ['SESSION_SECRET', 'VISIT_HASH_SECRET', 'FORM_TOKEN_SECRET'];
const DNS_SERVERS_MAX = 4;

export class EnvValidationError extends Error {
  constructor(issues) {
    super(`환경변수 검증 실패: ${issues.map((issue) => issue.variable).join(', ')}`);
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

function isOrigin(value) {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
  } catch {
    return false;
  }
}

export function parseTrustProxy(value) {
  if (value === 'false') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

/** "1.1.1.1, 8.8.8.8" → ['1.1.1.1', '8.8.8.8']. 설정하지 않으면 null (Node 기본 DNS 유지). */
export function parseDnsServers(value) {
  if (value === undefined) return null;
  return value
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean);
}

function isValidDnsServerList(list) {
  if (list === null) return true;
  return list.length > 0 && list.length <= DNS_SERVERS_MAX && list.every((server) => isIP(server) !== 0);
}

const secret = z.string().min(SECRET_MIN_LENGTH, `${SECRET_MIN_LENGTH}자 이상이어야 합니다.`);

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MONGODB_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\//, 'mongodb:// 또는 mongodb+srv:// 형식이어야 합니다.'),
  CLIENT_ORIGIN: z
    .string()
    .refine(isOrigin, '경로·끝 슬래시 없이 http(s)://호스트[:포트] 형식이어야 합니다.'),
  SESSION_SECRET: secret,
  VISIT_HASH_SECRET: secret,
  FORM_TOKEN_SECRET: secret,
  TRUST_PROXY: z.string().default('false').transform(parseTrustProxy),
  // 선택: Node(c-ares)가 OS의 DNS 설정을 읽지 못하는 환경에서만 사용한다.
  DNS_SERVERS: z
    .string()
    .optional()
    .transform(parseDnsServers)
    .refine(isValidDnsServerList, `IP 주소를 쉼표로 구분해 1~${DNS_SERVERS_MAX}개 입력해야 합니다.`),
});

const ENV_KEYS = Object.keys(baseSchema.shape);

const envSchema = baseSchema.superRefine((env, ctx) => {
  const seen = new Map();
  for (const key of SECRET_KEYS) {
    const value = env[key];
    if (typeof value !== 'string') continue;
    if (seen.has(value)) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: `${seen.get(value)}와 다른 값이어야 합니다.`,
      });
    } else {
      seen.set(value, key);
    }
  }
});

/**
 * 환경변수를 검증해 애플리케이션 설정 객체를 반환한다.
 * 빈 문자열은 "설정하지 않음"으로 취급한다 (`PORT=` → 기본값 사용).
 */
export function loadEnv(source = process.env) {
  const input = {};
  for (const key of ENV_KEYS) {
    const value = source[key];
    if (value !== undefined && value !== '') input[key] = value;
  }

  const result = envSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      variable: issue.path.join('.') || '(env)',
      reason: input[issue.path[0]] === undefined ? '값이 필요합니다.' : issue.message,
    }));
    throw new EnvValidationError(issues);
  }

  const env = result.data;
  return Object.freeze({
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    port: env.PORT,
    mongodbUri: env.MONGODB_URI,
    clientOrigin: env.CLIENT_ORIGIN,
    sessionSecret: env.SESSION_SECRET,
    visitHashSecret: env.VISIT_HASH_SECRET,
    formTokenSecret: env.FORM_TOKEN_SECRET,
    trustProxy: env.TRUST_PROXY,
    dnsServers: env.DNS_SERVERS === null ? null : Object.freeze([...env.DNS_SERVERS]),
  });
}
