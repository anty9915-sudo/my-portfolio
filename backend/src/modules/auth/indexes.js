import mongoose from 'mongoose';
import { SESSIONS_COLLECTION } from '../../config/session.js';
import { Admin } from './admin.model.js';

/**
 * 인증에 필요한 인덱스를 명시적으로 만든다 (DATABASE.md 6.3).
 * 서버 시작 시에는 호출하지 않고, 관리자 생성 스크립트 등에서만 호출한다.
 *  - admins.email_unique: { email: 1 } unique
 *  - sessions.sessions_ttl: { expires: 1 } expireAfterSeconds 0 (만료 세션 자동 삭제)
 * 이미 같은 정의로 있으면 아무것도 바꾸지 않는다.
 */
export async function ensureAuthIndexes(connection = mongoose.connection) {
  await Admin.createIndexes();
  await connection
    .collection(SESSIONS_COLLECTION)
    .createIndex({ expires: 1 }, { name: 'sessions_ttl', expireAfterSeconds: 0 });
}
