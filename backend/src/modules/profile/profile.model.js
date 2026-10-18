import mongoose from 'mongoose';
import { toIso } from '../../utils/serialize.js';

// profiles 컬렉션 (DATABASE.md 4.1). singletonKey "default"인 단일 문서로 운영한다.
export const PROFILE_SINGLETON_KEY = 'default';
export const PROFILE_LINK_TYPES = ['github', 'blog', 'linkedin', 'other'];

/** PUT은 전체 교체: 요청에서 생략한 선택 필드는 이 기본값으로 초기화한다 (DATABASE.md 4.1 기본값) */
export const PROFILE_OPTIONAL_DEFAULTS = Object.freeze({
  bio: null,
  goals: [],
  email: null,
  avatarUrl: null,
  resumeUrl: null,
  links: [],
});

const linkSchema = new mongoose.Schema(
  {
    // 필드 이름이 'type'이므로 Mongoose 타입 선언과 구분해 중첩 형태로 쓴다
    type: { type: String, required: true, enum: PROFILE_LINK_TYPES },
    label: { type: String, required: true, trim: true, maxlength: 30 },
    url: { type: String, required: true },
  },
  { _id: false },
);

const profileSchema = new mongoose.Schema(
  {
    singletonKey: {
      type: String,
      required: true,
      enum: [PROFILE_SINGLETON_KEY],
      default: PROFILE_SINGLETON_KEY,
      immutable: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 50 },
    headline: { type: String, required: true, trim: true, maxlength: 100 },
    bio: { type: String, default: null, maxlength: 3000 },
    goals: { type: [String], default: [] },
    email: { type: String, default: null, maxlength: 254 },
    avatarUrl: { type: String, default: null },
    resumeUrl: { type: String, default: null },
    links: { type: [linkSchema], default: [] },
  },
  { collection: 'profiles', timestamps: true, versionKey: false, strict: true },
);

profileSchema.index({ singletonKey: 1 }, { unique: true, name: 'singletonKey_unique' });

export const Profile = mongoose.models.Profile ?? mongoose.model('Profile', profileSchema);

/** GET /profile (API.md 8.2). _id·singletonKey·createdAt은 포함하지 않는다. */
export function toPublicProfile(profile) {
  return {
    name: profile.name,
    headline: profile.headline,
    bio: profile.bio ?? null,
    goals: profile.goals ?? [],
    email: profile.email ?? null,
    avatarUrl: profile.avatarUrl ?? null,
    resumeUrl: profile.resumeUrl ?? null,
    links: (profile.links ?? []).map(({ type, label, url }) => ({ type, label, url })),
    updatedAt: toIso(profile.updatedAt),
  };
}

/** PUT /admin/profile 응답: 공개 필드 + createdAt (id·_id·singletonKey 제외) */
export function toAdminProfile(profile) {
  return { ...toPublicProfile(profile), createdAt: toIso(profile.createdAt) };
}
