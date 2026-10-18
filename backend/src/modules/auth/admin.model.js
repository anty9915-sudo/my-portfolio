import mongoose from 'mongoose';

// admins 컬렉션 (DATABASE.md 4.5). 1단계는 관리자 1명, 회원가입 API 없음.
const adminSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin'], default: 'admin' },
    failedLoginCount: { type: Number, default: 0, min: 0 },
    lockUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
  },
  { collection: 'admins', timestamps: true, versionKey: false, strict: true },
);

adminSchema.index({ email: 1 }, { unique: true, name: 'email_unique' });

export const Admin = mongoose.models.Admin ?? mongoose.model('Admin', adminSchema);

/** GET /auth/me 응답 (API.md 9.3). passwordHash·잠금 정보는 절대 포함하지 않는다. */
export function toAdminResponse(admin) {
  return {
    id: admin._id.toString(),
    email: admin.email,
    role: admin.role,
    lastLoginAt: admin.lastLoginAt ? admin.lastLoginAt.toISOString() : null,
  };
}
