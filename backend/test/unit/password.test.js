import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../../src/modules/auth/password.js';

const PASSWORD = `pw-${randomBytes(12).toString('hex')}`;

describe('password (Argon2id)', () => {
  it('Argon2id 형식의 해시를 만들고 원문을 담지 않는다', async () => {
    const hash = await hashPassword(PASSWORD);
    // 매개변수 순서는 라이브러리 출력 형식(m,p,t)에 의존하지 않도록 각각 확인한다
    const [, algorithm, version, params] = hash.split('$');
    assert.equal(algorithm, 'argon2id');
    assert.equal(version, 'v=19');
    for (const key of ['m', 't', 'p']) assert.match(params, new RegExp(`(^|,)${key}=\\d+(,|$)`));
    assert.ok(!hash.includes(PASSWORD));
  });

  it('같은 비밀번호도 매번 다른 해시가 된다 (솔트)', async () => {
    assert.notEqual(await hashPassword(PASSWORD), await hashPassword(PASSWORD));
  });

  it('맞으면 true, 틀리면 false', async () => {
    const hash = await hashPassword(PASSWORD);
    assert.equal(await verifyPassword(hash, PASSWORD), true);
    assert.equal(await verifyPassword(hash, `${PASSWORD}x`), false);
  });

  it('해시 형식이 잘못되어도 예외 대신 false', async () => {
    assert.equal(await verifyPassword('not-a-hash', PASSWORD), false);
  });

  it('verifyAgainstDummy는 항상 false', async () => {
    assert.equal(await verifyAgainstDummy(PASSWORD), false);
  });
});
