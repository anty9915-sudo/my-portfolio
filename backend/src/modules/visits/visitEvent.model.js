import mongoose from 'mongoose';
import { DEVICE_TYPES } from './userAgent.js';

// visit_events 컬렉션 (DATABASE.md 4.7): 페이지뷰 원본 이벤트.
// IP·User-Agent 원문 필드가 없고 strict 모드라 저장될 수 없다. timestamps 대신 occurredAt을 쓴다.
// Time Series 컬렉션은 unique 인덱스를 지원하지 않으므로 일반 컬렉션 + TTL 인덱스로 둔다.
export const VISIT_EVENT_RETENTION_SECONDS = 90 * 24 * 60 * 60; // 90일 = 7,776,000초 (U-07)

const HEX_64 = /^[0-9a-f]{64}$/;

const visitEventSchema = new mongoose.Schema(
  {
    occurredAt: { type: Date, required: true }, // 서버 수신 시각
    dateKey: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // occurredAt의 KST 날짜
    path: { type: String, required: true, maxlength: 200 },
    referrerHost: { type: String, default: null, maxlength: 253 },
    deviceType: { type: String, required: true, enum: DEVICE_TYPES },
    visitorHash: { type: String, required: true, match: HEX_64 },
    dedupKey: { type: String, required: true, match: HEX_64 },
  },
  { collection: 'visit_events', versionKey: false, strict: true },
);

// 중복 제거는 이 unique 인덱스가 실제로 있어야 보장된다 (인덱스가 없으면 같은 방문이 여러 번 저장된다)
visitEventSchema.index({ dedupKey: 1 }, { unique: true, name: 'dedupKey_unique' });
// 90일이 지나면 MongoDB가 약 60초 주기로 자동 삭제한다 (인덱스가 없으면 삭제되지 않는다)
visitEventSchema.index(
  { occurredAt: 1 },
  { name: 'visit_events_ttl', expireAfterSeconds: VISIT_EVENT_RETENTION_SECONDS },
);
visitEventSchema.index({ dateKey: 1, path: 1 }, { name: 'visit_events_dateKey_path' });
visitEventSchema.index({ dateKey: 1, visitorHash: 1 }, { name: 'visit_events_dateKey_visitor' });

export const VisitEvent = mongoose.models.VisitEvent ?? mongoose.model('VisitEvent', visitEventSchema);
