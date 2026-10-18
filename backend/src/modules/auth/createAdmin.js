import { Admin } from './admin.model.js';
import { adminEmailSchema, newPasswordSchema } from './auth.validation.js';
import { ensureAuthIndexes } from './indexes.js';
import { hashPassword } from './password.js';

export class AdminSetupError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AdminSetupError';
  }
}

/** 입력값만 검증한다 (DB 접근 없음). 오류 메시지에 비밀번호를 담지 않는다. */
export function validateAdminInput({ email, password }) {
  const emailResult = adminEmailSchema.safeParse(email);
  if (!emailResult.success) throw new AdminSetupError(`ADMIN_EMAIL: ${emailResult.error.issues[0].message}`);
  const passwordResult = newPasswordSchema.safeParse(password);
  if (!passwordResult.success) throw new AdminSetupError(`비밀번호: ${passwordResult.error.issues[0].message}`);
  return { email: emailResult.data, password: passwordResult.data };
}

/**
 * 최초 관리자 1명을 만든다 (DATABASE.md 4.5, 8장). 회원가입 API 대신 스크립트에서만 호출한다.
 * 인증 인덱스를 먼저 만들고, 이미 관리자가 있으면 아무것도 바꾸지 않고 실패한다.
 * @returns {Promise<{ id: string, email: string }>}
 */
export async function createAdmin(input) {
  const { email, password } = validateAdminInput(input);
  await ensureAuthIndexes();
  if ((await Admin.countDocuments()) > 0) {
    throw new AdminSetupError('관리자 계정이 이미 있습니다. 1단계는 관리자 1명만 허용합니다.');
  }
  const admin = await Admin.create({ email, passwordHash: await hashPassword(password) });
  return { id: admin._id.toString(), email: admin.email };
}
