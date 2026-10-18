import { ApiError } from '../../utils/ApiError.js';
import { Profile, PROFILE_OPTIONAL_DEFAULTS, PROFILE_SINGLETON_KEY } from './profile.model.js';

const MONGO_DUPLICATE_KEY = 11000;
const singletonFilter = () => ({ singletonKey: PROFILE_SINGLETON_KEY });

/** 프로필이 아직 없으면 404 (API.md 8.2) */
export async function getProfile() {
  const profile = await Profile.findOne(singletonFilter()).lean();
  if (!profile) throw ApiError.notFound('프로필이 아직 없습니다.');
  return profile;
}

async function replaceExisting(profile, values) {
  profile.set(values);
  await profile.save(); // createdAt 유지, updatedAt 갱신
  return { profile: profile.toObject(), created: false };
}

/**
 * PUT /admin/profile — 전체 교체 (API.md 10.1). PUT /admin/profile이 유일한 생성 경로다.
 * 생략한 선택 필드는 기본값으로 초기화한다. 없으면 생성(created: true), 있으면 교체.
 *
 * 처음 생성이 동시에 겹치면 singletonKey_unique 인덱스가 두 번째 생성을 막고(E11000),
 * 실패한 요청은 먼저 만들어진 문서를 교체하는 것으로 처리한다.
 * 이 보장은 unique 인덱스에 의존한다 (인덱스가 없으면 동시 생성으로 문서가 2개 생길 수 있다).
 */
export async function replaceProfile(body) {
  const values = { ...PROFILE_OPTIONAL_DEFAULTS, ...body };

  const existing = await Profile.findOne(singletonFilter());
  if (existing) return replaceExisting(existing, values);

  try {
    const created = await Profile.create({ ...values, singletonKey: PROFILE_SINGLETON_KEY });
    return { profile: created.toObject(), created: true };
  } catch (error) {
    if (error?.code !== MONGO_DUPLICATE_KEY) throw error;
    const winner = await Profile.findOne(singletonFilter());
    if (!winner) throw error;
    return replaceExisting(winner, values);
  }
}
