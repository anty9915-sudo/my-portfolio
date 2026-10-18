// 최초 관리자 계정 생성 스크립트 (사용자가 직접 실행)
//
//   cd backend
//   npm run admin:create
//
// - 이메일은 backend/.env의 ADMIN_EMAIL에서 읽는다.
// - 비밀번호는 실행 중 화면에 표시되지 않게 두 번 입력받는다. 파일·환경변수에 저장하지 않는다.
// - DB에 쓰기 전 대상 DB와 변경 내용을 보여 주고 "yes" 입력을 받는다.
// - 변경 내용: admins·sessions 인덱스 생성(없을 때만), admins 문서 1건 추가.
// - Windows Git Bash(mintty)에서는 비밀번호 숨김 입력이 동작하지 않을 수 있다. PowerShell 또는 cmd를 사용한다.

import { createInterface } from 'node:readline/promises';
import { connectDatabase, disconnectDatabase, redactCredentials } from '../src/config/database.js';
import { applyDnsServers } from '../src/config/dns.js';
import { EnvValidationError, loadEnv } from '../src/config/env.js';
import { AdminSetupError, createAdmin, validateAdminInput } from '../src/modules/auth/createAdmin.js';

function promptHidden(question) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    let value = '';
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          cleanup();
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          cleanup();
          reject(new AdminSetupError('사용자가 취소했습니다.'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') {
          value = value.slice(0, -1);
        } else if (ch >= ' ') {
          value += ch;
        }
      }
    };
    stdout.write(question);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim() === 'yes';
  } finally {
    rl.close();
  }
}

function databaseName(uri) {
  return uri.replace(/^mongodb(\+srv)?:\/\/[^/]*/, '').match(/^\/([^?/]+)/)?.[1] ?? '(지정 안 됨: test)';
}

async function main() {
  if (!process.stdin.isTTY) {
    throw new AdminSetupError('대화형 터미널에서 실행해 주세요 (PowerShell 또는 cmd 권장).');
  }

  const env = loadEnv(process.env);
  const email = process.env.ADMIN_EMAIL ?? '';
  validateAdminInput({ email, password: 'x'.repeat(12) }); // 이메일 형식만 먼저 확인

  const password = await promptHidden('관리자 비밀번호 (12~128자, 화면에 표시되지 않음): ');
  const repeated = await promptHidden('비밀번호 확인: ');
  if (password !== repeated) throw new AdminSetupError('두 비밀번호가 일치하지 않습니다.');
  const input = validateAdminInput({ email, password });

  console.log('\n다음 작업을 실행합니다.');
  console.log(`  대상 DB         : ${databaseName(env.mongodbUri)}`);
  console.log(`  관리자 이메일   : ${input.email}`);
  console.log('  인덱스 (없을 때만 생성): admins.email_unique, sessions.sessions_ttl');
  console.log('  문서 추가       : admins 1건 (관리자가 이미 있으면 아무것도 바꾸지 않고 중단)');
  if (!(await confirm('계속하려면 yes를 입력하세요: '))) {
    console.log('취소했습니다. 변경 사항 없음.');
    return;
  }

  applyDnsServers(env.dnsServers);
  try {
    await connectDatabase(env.mongodbUri, { autoIndex: false, autoCreate: false });
    const admin = await createAdmin(input);
    console.log(`관리자 계정을 만들었습니다: ${admin.email}`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  if (error instanceof EnvValidationError) {
    console.error('환경변수 검증 실패:');
    for (const issue of error.issues) console.error(`  - ${issue.variable}: ${issue.reason}`);
  } else if (error instanceof AdminSetupError) {
    console.error(`중단: ${error.message}`);
  } else {
    console.error(`오류: ${error.name}: ${redactCredentials(error.message)}`);
  }
  process.exitCode = 1;
});
