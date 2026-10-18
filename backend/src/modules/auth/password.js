import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';

// 비밀번호 정책 (API.md 9.4)
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Argon2id 해시 (argon2 패키지 기본 매개변수: m=64MiB, t=3, p=4) */
export function hashPassword(plain) {
  return argon2.hash(plain, { type: argon2.argon2id });
}

/** 해시 형식이 잘못되었거나 불일치하면 false. 예외를 밖으로 던지지 않는다. */
export async function verifyPassword(hash, plain) {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

let dummyHashPromise;

/**
 * 존재하지 않는 이메일로 로그인할 때도 같은 비용의 검증을 수행해
 * 응답 시간으로 계정 존재 여부를 추측하기 어렵게 한다. 항상 false.
 */
export async function verifyAgainstDummy(plain) {
  dummyHashPromise ??= hashPassword(randomBytes(32).toString('hex'));
  await verifyPassword(await dummyHashPromise, plain);
  return false;
}
