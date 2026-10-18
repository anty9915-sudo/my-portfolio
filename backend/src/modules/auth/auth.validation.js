import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './password.js';

// 오류 메시지에 입력값(특히 비밀번호)을 담지 않는다.

export const adminEmailSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
  z.email('이메일 형식이 올바르지 않습니다.').max(254, '254자 이하여야 합니다.'),
);

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`)
  .max(PASSWORD_MAX_LENGTH, `${PASSWORD_MAX_LENGTH}자 이하여야 합니다.`);

const passwordInput = z
  .string()
  .min(1, '비밀번호를 입력해 주세요.')
  .max(PASSWORD_MAX_LENGTH, `${PASSWORD_MAX_LENGTH}자 이하여야 합니다.`);

/** POST /auth/login (API.md 9.1). 정의되지 않은 필드는 400. */
export const loginBodySchema = z.strictObject({
  email: adminEmailSchema,
  password: passwordInput,
});

/** PATCH /auth/password (API.md 9.4) */
export const changePasswordBodySchema = z
  .strictObject({
    currentPassword: passwordInput,
    newPassword: newPasswordSchema,
  })
  .refine((body) => body.currentPassword !== body.newPassword, {
    path: ['newPassword'],
    message: '현재 비밀번호와 달라야 합니다.',
  });
