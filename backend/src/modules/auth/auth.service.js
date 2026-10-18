import mongoose from 'mongoose';
import { SESSIONS_COLLECTION } from '../../config/session.js';
import { ApiError } from '../../utils/ApiError.js';
import { Admin } from './admin.model.js';
import { hashPassword, verifyAgainstDummy, verifyPassword } from './password.js';

// 계정 잠금 정책 (API.md 6장): 연속 5회 실패 시 15분 잠금
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

function lockRemainingSeconds(admin, now) {
  if (!admin.lockUntil) return 0;
  const remainingMs = admin.lockUntil.getTime() - now;
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

/** 실패 횟수를 원자적으로 올리고, 한도에 도달하면 잠그고 횟수를 초기화한다. */
async function recordFailedAttempt(adminId, now) {
  const updated = await Admin.findByIdAndUpdate(
    adminId,
    { $inc: { failedLoginCount: 1 } },
    { returnDocument: 'after' },
  );
  if (updated && updated.failedLoginCount >= MAX_FAILED_ATTEMPTS) {
    await Admin.updateOne(
      { _id: adminId },
      { $set: { lockUntil: new Date(now + LOCK_DURATION_MS), failedLoginCount: 0 } },
    );
  }
}

/**
 * 이메일·비밀번호를 확인한다. 성공하면 실패 횟수·잠금을 초기화하고 lastLoginAt을 기록한다.
 * @returns {Promise<{ id: string, email: string }>}
 */
export async function authenticate(email, password, now = Date.now()) {
  const admin = await Admin.findOne({ email }).select('+passwordHash');
  if (!admin) {
    await verifyAgainstDummy(password);
    throw ApiError.invalidCredentials();
  }

  const lockedFor = lockRemainingSeconds(admin, now);
  if (lockedFor > 0) throw ApiError.tooManyAttempts(lockedFor);

  if (!(await verifyPassword(admin.passwordHash, password))) {
    await recordFailedAttempt(admin._id, now);
    throw ApiError.invalidCredentials();
  }

  await Admin.updateOne(
    { _id: admin._id },
    { $set: { failedLoginCount: 0, lockUntil: null, lastLoginAt: new Date(now) } },
  );
  return { id: admin._id.toString(), email: admin.email };
}

/**
 * 현재 비밀번호를 확인한 뒤 새 비밀번호로 바꾼다. 현재 비밀번호 불일치는 로그인 실패 횟수에 포함한다.
 * 호출한 쪽은 이어서 현재 세션을 재발급(loginAt = now)하고 다른 세션을 삭제해야 한다.
 */
export async function changePassword(adminId, currentPassword, newPassword, now = Date.now()) {
  const admin = await Admin.findById(adminId).select('+passwordHash');
  if (!admin) throw ApiError.unauthenticated();

  const lockedFor = lockRemainingSeconds(admin, now);
  if (lockedFor > 0) throw ApiError.tooManyAttempts(lockedFor);

  if (!(await verifyPassword(admin.passwordHash, currentPassword))) {
    await recordFailedAttempt(admin._id, now);
    throw ApiError.invalidCredentials();
  }

  const passwordHash = await hashPassword(newPassword);
  await Admin.updateOne(
    { _id: admin._id },
    { $set: { passwordHash, passwordChangedAt: new Date(now), failedLoginCount: 0, lockUntil: null } },
  );
}

/** 해당 관리자의 세션 중 keepSessionId를 제외하고 모두 삭제한다. */
export async function deleteOtherSessions(adminId, keepSessionId) {
  await mongoose.connection
    .collection(SESSIONS_COLLECTION)
    .deleteMany({ _id: { $ne: keepSessionId }, 'session.adminId': adminId });
}
