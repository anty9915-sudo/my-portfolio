import mongoose from 'mongoose';
import { toId, toIso } from '../../utils/serialize.js';

// inquiries 컬렉션 (DATABASE.md 4.6)
// 저장하지 않는 정보: IP, User-Agent, 허니팟 값, 폼 토큰 (스키마에 필드 자체가 없고 strict 모드라 저장될 수 없다).
export const INQUIRY_STATUSES = ['new', 'read', 'replied', 'archived'];
export const INQUIRY_RETENTION_MS = 180 * 24 * 60 * 60 * 1000; // 접수 후 180일 (U-06)
export const INQUIRY_ADMIN_SORT = { createdAt: -1, _id: -1 };
const MESSAGE_PREVIEW_LENGTH = 100;

const consentSchema = new mongoose.Schema(
  {
    agreed: { type: Boolean, required: true, validate: (value) => value === true },
    version: { type: String, required: true, maxlength: 20 },
    agreedAt: { type: Date, required: true },
  },
  { _id: false },
);

const inquirySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    subject: { type: String, default: null, maxlength: 100 },
    message: { type: String, required: true, maxlength: 3000 },
    status: { type: String, enum: INQUIRY_STATUSES, default: 'new' },
    adminMemo: { type: String, default: null, maxlength: 1000 },
    consent: { type: consentSchema, required: true },
    contentHash: { type: String, required: true, match: /^[0-9a-f]{64}$/ },
    readAt: { type: Date, default: null },
    repliedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'inquiries', timestamps: true, versionKey: false, strict: true },
);

inquirySchema.index({ status: 1, createdAt: -1 }, { name: 'inquiries_status_createdAt' });
inquirySchema.index({ createdAt: -1 }, { name: 'inquiries_createdAt' });
inquirySchema.index({ contentHash: 1, createdAt: -1 }, { name: 'inquiries_contentHash' });
// TTL: expiresAt 시각이 지나면 MongoDB가 약 60초 주기로 자동 삭제한다
inquirySchema.index({ expiresAt: 1 }, { name: 'inquiries_ttl', expireAfterSeconds: 0 });

export const Inquiry = mongoose.models.Inquiry ?? mongoose.model('Inquiry', inquirySchema);

/** 이모지 등 서로게이트 쌍이 잘리지 않도록 글자 단위로 자른다 */
function preview(message) {
  return Array.from(message).slice(0, MESSAGE_PREVIEW_LENGTH).join('');
}

/** GET /admin/inquiries 목록 항목 (API.md 11.1) */
export function toAdminInquiryListItem(inquiry) {
  return {
    id: toId(inquiry._id),
    name: inquiry.name,
    email: inquiry.email,
    subject: inquiry.subject ?? null,
    messagePreview: preview(inquiry.message),
    status: inquiry.status,
    createdAt: toIso(inquiry.createdAt),
    expiresAt: toIso(inquiry.expiresAt),
  };
}

/** GET /admin/inquiries/:id (API.md 11.2). contentHash는 내부용이라 반환하지 않는다. */
export function toAdminInquiry(inquiry) {
  return {
    ...toAdminInquiryListItem(inquiry),
    message: inquiry.message,
    adminMemo: inquiry.adminMemo ?? null,
    consent: { version: inquiry.consent.version, agreedAt: toIso(inquiry.consent.agreedAt) },
    readAt: toIso(inquiry.readAt),
    repliedAt: toIso(inquiry.repliedAt),
    updatedAt: toIso(inquiry.updatedAt),
  };
}
