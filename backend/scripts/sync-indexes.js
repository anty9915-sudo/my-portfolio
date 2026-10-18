// 인덱스 동기화 스크립트 (사용자가 직접 실행)
//
//   cd backend
//   npm run db:sync-indexes -- --dry-run   # 계획만 표시 (읽기 전용: 인덱스 목록 조회)
//   npm run db:sync-indexes                # 계획 표시 → "yes" 입력 시 없는 인덱스만 생성
//
// - DATABASE.md 6.3에 정의된 인덱스(모델 스키마 + sessions TTL)를 기준으로 한다.
// - 없는 인덱스만 만든다. 기존 인덱스는 삭제·변경하지 않는다 (dropIndex·collMod 사용 안 함).
// - 이름이나 키가 같지만 정의가 다른 인덱스(conflict)가 하나라도 있으면 아무것도 만들지 않고 중단한다.
// - 컬렉션이 없으면 인덱스 생성 시 MongoDB가 빈 컬렉션을 함께 만든다.

import { createInterface } from 'node:readline/promises';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase, redactCredentials } from '../src/config/database.js';
import { applyDnsServers } from '../src/config/dns.js';
import { EnvValidationError, loadEnv } from '../src/config/env.js';
import { createMissingIndexes, planIndexes } from '../src/config/indexes.js';

const STATE_LABELS = {
  missing: '생성 예정',
  exists: '이미 있음',
  'exists-other-name': '같은 정의가 다른 이름으로 있음 (그대로 둠)',
  conflict: '충돌: 정의가 다름 (자동으로 고치지 않음)',
};

function printPlan(plan) {
  for (const item of plan) {
    const other = item.existingName && item.existingName !== item.name ? ` → 기존: ${item.existingName}` : '';
    console.log(`  ${`${item.collection}.${item.name}`.padEnd(42)} ${STATE_LABELS[item.state]}${other}`);
  }
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
  const dryRun = process.argv.includes('--dry-run');
  if (!dryRun && !process.stdin.isTTY) {
    throw new Error('대화형 터미널에서 실행하거나 --dry-run으로 계획만 확인해 주세요.');
  }

  const env = loadEnv(process.env);
  applyDnsServers(env.dnsServers);
  await connectDatabase(env.mongodbUri, { autoIndex: false, autoCreate: false });

  try {
    const { db } = mongoose.connection;
    console.log(`대상 DB: ${databaseName(env.mongodbUri)}${dryRun ? '  (dry-run: 변경 없음)' : ''}`);
    const plan = await planIndexes(db);
    printPlan(plan);

    const conflicts = plan.filter((item) => item.state === 'conflict');
    const missing = plan.filter((item) => item.state === 'missing');
    if (conflicts.length > 0) {
      console.error(`\n충돌 ${conflicts.length}건: 아무것도 만들지 않고 중단합니다. 충돌 인덱스는 직접 확인해 주세요.`);
      process.exitCode = 1;
      return;
    }
    if (missing.length === 0) {
      console.log('\n생성할 인덱스가 없습니다.');
      return;
    }
    if (dryRun) {
      console.log(`\ndry-run: 생성 예정 ${missing.length}건 (실행하지 않음)`);
      return;
    }
    if (!(await confirm(`\n위 ${missing.length}건을 생성하려면 yes를 입력하세요: `))) {
      console.log('취소했습니다. 변경 사항 없음.');
      return;
    }

    const created = await createMissingIndexes(db, plan);
    console.log(`생성 완료 ${created.length}건:`);
    for (const name of created) console.log(`  ${name}`);
    const after = await planIndexes(db);
    const remaining = after.filter((item) => item.state === 'missing').length;
    console.log(remaining === 0 ? '확인: 누락된 인덱스 없음' : `확인: 아직 누락 ${remaining}건`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  if (error instanceof EnvValidationError) {
    console.error('환경변수 검증 실패:');
    for (const issue of error.issues) console.error(`  - ${issue.variable}: ${issue.reason}`);
  } else {
    console.error(`오류: ${error.name}: ${redactCredentials(error.message)}`);
  }
  process.exitCode = 1;
});
