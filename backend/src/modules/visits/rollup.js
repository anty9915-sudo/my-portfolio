import mongoose from 'mongoose';
import { addDays, dateKeysInRange, kstDayStartMs, toKstDateKey } from '../../utils/kstDate.js';
import { DEVICE_TYPES } from './userAgent.js';
import { TOP_LIST_LIMIT, VisitDailyStat } from './visitDailyStat.model.js';
import { VISIT_EVENT_RETENTION_SECONDS, VisitEvent } from './visitEvent.model.js';

// 일별 집계 (DATABASE.md 4.8). 마감된 날짜만 visit_daily_stats에 저장하고, 같은 날짜를 다시 집계해도 같은 결과로 덮어쓴다.

/** KST 자정 후 이 시간이 지나야 전날을 마감한다 (자정 직전 요청이 늦게 저장되어도 빠지지 않게) */
export const ROLLUP_GRACE_MS = 5 * 60 * 1000;
const RAW_RETENTION_MS = VISIT_EVENT_RETENTION_SECONDS * 1000;

export function emptyDayStats() {
  return {
    pageviews: 0,
    uniqueVisitors: 0,
    topPaths: [],
    topReferrers: [],
    devices: { desktop: 0, mobile: 0, tablet: 0, unknown: 0 },
  };
}

/** 마감된 마지막 날짜: (지금 − 5분)의 KST 날짜의 전날 */
export function lastFinalizedDateKey(now) {
  return addDays(toKstDateKey(new Date(now - ROLLUP_GRACE_MS)), -1);
}

/** 원본이 온전히 남아 있는 가장 이른 날짜: KST 00:00이 지금으로부터 90일 이내인 첫 날 */
export function rawRetentionStartKey(now) {
  const cutoff = now - RAW_RETENTION_MS;
  const key = toKstDateKey(new Date(cutoff));
  return kstDayStartMs(key) < cutoff ? addDays(key, 1) : key;
}

/**
 * 원본 이벤트를 집계한다. match는 aggregate 단계라 sanitizeFilter 대상이 아니다 (서버가 만든 조건만 넘긴다).
 * @param {object} match 예: { dateKey: '2026-10-15' } 또는 { dateKey: { $gte, $lte } }
 */
export async function aggregateRawStats(match, topLimit = TOP_LIST_LIMIT) {
  const [result] = await VisitEvent.aggregate([
    { $match: match },
    {
      $facet: {
        totals: [
          { $group: { _id: null, pageviews: { $sum: 1 }, visitors: { $addToSet: '$visitorHash' } } },
          { $project: { _id: 0, pageviews: 1, uniqueVisitors: { $size: '$visitors' } } },
        ],
        paths: [
          { $group: { _id: '$path', pageviews: { $sum: 1 } } },
          { $sort: { pageviews: -1, _id: 1 } },
          { $limit: topLimit },
        ],
        referrers: [
          { $match: { referrerHost: { $ne: null } } },
          { $group: { _id: '$referrerHost', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: topLimit },
        ],
        devices: [{ $group: { _id: '$deviceType', count: { $sum: 1 } } }],
      },
    },
  ]);

  const stats = emptyDayStats();
  const totals = result.totals[0];
  if (totals) {
    stats.pageviews = totals.pageviews;
    stats.uniqueVisitors = totals.uniqueVisitors;
  }
  stats.topPaths = result.paths.map(({ _id, pageviews }) => ({ path: _id, pageviews }));
  stats.topReferrers = result.referrers.map(({ _id, count }) => ({ host: _id, count }));
  for (const { _id, count } of result.devices) {
    if (DEVICE_TYPES.includes(_id)) stats.devices[_id] = count;
  }
  return stats;
}

/** 하루를 (다시) 집계해 저장한다. 같은 원본이면 몇 번 실행해도 같은 결과 */
export async function rollupDay(dateKey, now = Date.now()) {
  const stats = await aggregateRawStats({ dateKey });
  await VisitDailyStat.updateOne(
    { dateKey },
    { $set: { ...stats, dateKey, computedAt: new Date(now) } },
    { upsert: true },
  );
  return stats;
}

/**
 * 집계 시작일 = 원본 보관 기간 시작일과 가장 이른 원본 이벤트 날짜 중 늦은 날.
 * 원본 이벤트가 하나도 없으면 null (집계하지 않음).
 */
export function rollupStartKey(earliestEventDateKey, now) {
  if (!earliestEventDateKey) return null;
  const retentionStart = rawRetentionStartKey(now);
  return earliestEventDateKey > retentionStart ? earliestEventDateKey : retentionStart;
}

/**
 * 가장 이른 원본 이벤트 날짜부터(보관 기간 안에서) 마감된 날짜 중 아직 집계되지 않은 날을 채운다.
 * 그 사이 방문이 없는 날도 0으로 저장한다.
 * 원본 이벤트가 하나도 없으면 아무것도 쓰지 않는다 — 읽기만 하므로 빈 DB에서 서버를 시작해도
 * visit_daily_stats 컬렉션이 생기지 않는다 (서버 시작 시 컬렉션 자동 생성 금지).
 * @returns {Promise<string[]>} 새로 집계한 날짜 키
 */
export async function rollupMissingDays(now = Date.now()) {
  const earliest = await VisitEvent.findOne({}, 'dateKey').sort({ occurredAt: 1 }).lean();
  const start = rollupStartKey(earliest?.dateKey, now);
  const end = lastFinalizedDateKey(now);
  if (!start || start > end) return [];

  const existing = await VisitDailyStat.find(
    { dateKey: mongoose.trusted({ $gte: start, $lte: end }) },
    'dateKey',
  ).lean();
  const done = new Set(existing.map((doc) => doc.dateKey));
  const missing = dateKeysInRange(start, end).filter((key) => !done.has(key));
  for (const key of missing) await rollupDay(key, now);
  return missing;
}

/**
 * 실행 중인 작업이 있으면 새로 시작하지 않고 그 결과를 함께 기다린다 (같은 프로세스 안의 겹침 방지).
 * 서버가 여러 대면 서버끼리는 막지 못한다 — 같은 결과를 덮어쓰므로 결과는 같지만,
 * dateKey_unique 인덱스가 없으면 동시 upsert로 중복 문서가 생길 수 있다.
 */
export function createSerialRunner(task) {
  let running = null;
  return (...args) => {
    if (!running) {
      running = Promise.resolve()
        .then(() => task(...args))
        .finally(() => {
          running = null;
        });
    }
    return running;
  };
}

/** 스케줄러와 대시보드 보정이 함께 쓰는 집계 실행기 */
export const runRollup = createSerialRunner(rollupMissingDays);
