import { Admin } from '../modules/auth/admin.model.js';
import { Inquiry } from '../modules/inquiries/inquiry.model.js';
import { Profile } from '../modules/profile/profile.model.js';
import { Project } from '../modules/projects/project.model.js';
import { Skill } from '../modules/skills/skill.model.js';
import { StudyRecord } from '../modules/study-records/studyRecord.model.js';
import { VisitDailyStat } from '../modules/visits/visitDailyStat.model.js';
import { VisitEvent } from '../modules/visits/visitEvent.model.js';
import { SESSIONS_COLLECTION } from './session.js';

// 인덱스 동기화 (DATABASE.md 6.3). 없는 인덱스만 만들고, 기존 인덱스는 삭제·변경하지 않는다.

const MODELS = [Admin, Profile, Skill, Project, StudyRecord, Inquiry, VisitEvent, VisitDailyStat];
const NAMESPACE_NOT_FOUND = 26;

/** 스키마에 선언한 인덱스 + 세션 TTL 인덱스 (세션은 connect-mongo가 쓰는 컬렉션이라 모델이 없다) */
export function getIndexDefinitions() {
  const fromModels = MODELS.flatMap((model) =>
    model.schema.indexes().map(([key, options]) => {
      const { background, ...rest } = options; // 서버가 무시하는 옵션은 비교·생성에서 뺀다
      return { collection: model.collection.collectionName, name: rest.name, key, options: rest };
    }),
  );
  return [
    ...fromModels,
    {
      collection: SESSIONS_COLLECTION,
      name: 'sessions_ttl',
      key: { expires: 1 },
      options: { name: 'sessions_ttl', expireAfterSeconds: 0 },
    },
  ];
}

const sameKey = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function sameDefinition(existing, definition) {
  const { options } = definition;
  if (!sameKey(existing.key, definition.key)) return false;
  if (Boolean(existing.unique) !== Boolean(options.unique)) return false;
  if ((existing.expireAfterSeconds ?? null) !== (options.expireAfterSeconds ?? null)) return false;
  if (options.collation) {
    return (
      existing.collation?.locale === options.collation.locale &&
      existing.collation?.strength === options.collation.strength
    );
  }
  return !existing.collation || existing.collation.locale === 'simple';
}

async function listExistingIndexes(db, collection) {
  try {
    return await db.collection(collection).indexes();
  } catch (error) {
    if (error.code === NAMESPACE_NOT_FOUND) return []; // 컬렉션이 아직 없음
    throw error;
  }
}

/**
 * 각 인덱스의 상태를 확인한다 (읽기 전용).
 *  - missing: 없음 → 생성 대상
 *  - exists: 같은 이름·같은 정의로 있음
 *  - exists-other-name: 같은 정의가 다른 이름으로 있음 → 그대로 둔다
 *  - conflict: 같은 이름이나 같은 키가 다른 옵션으로 있음 → 자동으로 고치지 않는다
 */
export async function planIndexes(db, definitions = getIndexDefinitions()) {
  const collections = [...new Set(definitions.map((definition) => definition.collection))];
  const existingByCollection = new Map();
  for (const collection of collections) {
    existingByCollection.set(collection, await listExistingIndexes(db, collection));
  }

  return definitions.map((definition) => {
    const existing = existingByCollection.get(definition.collection);
    const byName = existing.find((index) => index.name === definition.name);
    if (byName) {
      return { ...definition, state: sameDefinition(byName, definition) ? 'exists' : 'conflict', existingName: byName.name };
    }
    const sameSpec = existing.find((index) => sameDefinition(index, definition));
    if (sameSpec) return { ...definition, state: 'exists-other-name', existingName: sameSpec.name };
    const sameKeyOnly = existing.find((index) => sameKey(index.key, definition.key));
    if (sameKeyOnly) return { ...definition, state: 'conflict', existingName: sameKeyOnly.name };
    return { ...definition, state: 'missing' };
  });
}

/** plan에서 missing인 인덱스만 만든다. 삭제·변경 명령은 사용하지 않는다. */
export async function createMissingIndexes(db, plan) {
  const created = [];
  for (const item of plan.filter((entry) => entry.state === 'missing')) {
    await db.collection(item.collection).createIndex(item.key, item.options);
    created.push(`${item.collection}.${item.name}`);
  }
  return created;
}
