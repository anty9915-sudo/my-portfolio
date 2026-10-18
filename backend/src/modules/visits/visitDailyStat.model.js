import mongoose from 'mongoose';

// visit_daily_stats 컬렉션 (DATABASE.md 4.8): 마감된 날짜의 비식별 집계. 영구 보관.
export const TOP_LIST_LIMIT = 20;

const deviceCountsSchema = new mongoose.Schema(
  {
    desktop: { type: Number, default: 0, min: 0 },
    mobile: { type: Number, default: 0, min: 0 },
    tablet: { type: Number, default: 0, min: 0 },
    unknown: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const visitDailyStatSchema = new mongoose.Schema(
  {
    dateKey: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    pageviews: { type: Number, required: true, min: 0 },
    uniqueVisitors: { type: Number, required: true, min: 0 },
    topPaths: { type: [{ _id: false, path: String, pageviews: Number }], default: [] },
    topReferrers: { type: [{ _id: false, host: String, count: Number }], default: [] },
    devices: { type: deviceCountsSchema, required: true },
    computedAt: { type: Date, required: true },
  },
  { collection: 'visit_daily_stats', versionKey: false, strict: true },
);

// 날짜별 문서 1개는 이 unique 인덱스가 있어야 보장된다 (인덱스가 없으면 동시 집계 시 중복 문서가 생길 수 있다)
visitDailyStatSchema.index({ dateKey: 1 }, { unique: true, name: 'dateKey_unique' });

export const VisitDailyStat =
  mongoose.models.VisitDailyStat ?? mongoose.model('VisitDailyStat', visitDailyStatSchema);
