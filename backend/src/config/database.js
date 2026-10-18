import mongoose from 'mongoose';

// 사용자 입력이 쿼리 연산자($ne 등)로 해석되지 않도록 한다 (DATABASE.md 1.1).
mongoose.set('sanitizeFilter', true);
mongoose.set('strictQuery', true);

const SERVER_SELECTION_TIMEOUT_MS = 10_000;

/**
 * MongoDB에 연결한다. 실패하면 예외를 그대로 던져 서버 시작을 중단하게 한다.
 * @param {string} uri DB 이름이 경로에 포함된 연결 문자열
 * @param {{ autoIndex?: boolean, autoCreate?: boolean }} [options]
 *   서버는 둘 다 false로 연결한다: 시작만으로 Atlas에 컬렉션·인덱스를 만들지 않고,
 *   인덱스는 scripts의 명시적 함수로만 생성한다. 테스트(메모리 DB)는 기본값 true를 쓴다.
 */
export async function connectDatabase(uri, { autoIndex = true, autoCreate = true } = {}) {
  await mongoose.connect(uri, {
    autoIndex,
    autoCreate,
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
  });
  return mongoose.connection;
}

/** 세션 저장소가 mongoose와 같은 연결·DB를 쓰도록 클라이언트와 DB 이름을 돌려준다. */
export function getDatabaseTarget() {
  return { client: mongoose.connection.getClient(), dbName: mongoose.connection.name };
}

export function disconnectDatabase() {
  return mongoose.disconnect();
}

export function isDatabaseConnected() {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

/** 오류 메시지에 연결 문자열의 계정 정보가 섞여 있으면 가린다. */
export function redactCredentials(message) {
  return String(message).replace(/(mongodb(?:\+srv)?:\/\/)[^@/\s]+@/gi, '$1***@');
}
