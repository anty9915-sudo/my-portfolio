import MongoStore from 'connect-mongo';
import session from 'express-session';

// 관리자 세션 (API.md 4장, CLAUDE.md 8.1)
export const SESSION_IDLE_MS = 2 * 60 * 60 * 1000; // 유휴 2시간 (요청마다 연장)
export const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000; // 로그인 후 최대 12시간
export const SESSIONS_COLLECTION = 'sessions';

export function sessionCookieName(isProduction) {
  return isProduction ? '__Host-sid' : 'sid';
}

/** 쿠키 발급·삭제에 같은 속성을 써야 브라우저가 같은 쿠키로 인식한다. */
export function sessionCookieOptions(isProduction) {
  return { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/' };
}

/**
 * MongoDB 세션 저장소. 세션 문서에는 adminId·loginAt(+쿠키 메타데이터)만 저장한다.
 * autoRemove: 'disabled' — 서버 시작 시 TTL 인덱스를 자동 생성하지 않는다.
 * 만료 세션은 조회 시 저장소가 걸러 내며, TTL 인덱스는 ensureAuthIndexes()로 명시적으로 만든다.
 */
export function createSessionStore({ client, dbName }) {
  return MongoStore.create({
    client,
    dbName,
    collectionName: SESSIONS_COLLECTION,
    ttl: SESSION_IDLE_MS / 1000,
    autoRemove: 'disabled',
    stringify: false,
  });
}

export function createSessionMiddleware({ secret, isProduction, store }) {
  return session({
    name: sessionCookieName(isProduction),
    secret,
    store,
    resave: false,
    saveUninitialized: false, // 로그인 전 방문자에게는 쿠키·세션을 만들지 않는다
    rolling: true,
    unset: 'destroy',
    cookie: { ...sessionCookieOptions(isProduction), maxAge: SESSION_IDLE_MS },
  });
}

function promisify(req, method) {
  return new Promise((resolve, reject) => {
    req.session[method]((error) => (error ? reject(error) : resolve()));
  });
}

/** 세션 ID를 새로 발급하고(세션 고정 방지) 인증 정보를 저장한다. 기존 세션은 저장소에서 삭제된다. */
export async function establishSession(req, adminId, loginAt) {
  await promisify(req, 'regenerate');
  req.session.adminId = adminId;
  req.session.loginAt = loginAt;
  await promisify(req, 'save');
}

export function destroySession(req) {
  return req.session ? promisify(req, 'destroy') : Promise.resolve();
}
