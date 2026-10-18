import mongoose from 'mongoose';
import { dateKeysInRange, KST_TIMEZONE, toKstDateKey } from '../../utils/kstDate.js';
import {
  aggregateRawStats,
  emptyDayStats,
  lastFinalizedDateKey,
  rawRetentionStartKey,
  runRollup,
} from './rollup.js';
import { DEVICE_TYPES } from './userAgent.js';
import { DEFAULT_TOP, resolveStatsRange } from './visit.validation.js';
import { VisitDailyStat } from './visitDailyStat.model.js';

function mergeTopLists(lists, keyName, countName, top) {
  const totals = new Map();
  for (const list of lists) {
    for (const entry of list) totals.set(entry[keyName], (totals.get(entry[keyName]) ?? 0) + entry[countName]);
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, top)
    .map(([key, count]) => ({ [keyName]: key, [countName]: count }));
}

/**
 * GET /admin/stats/visits (API.md 12.1)
 * - 조회 전에 원본 보관 기간 안의 누락된 마감 날짜를 보정한다.
 * - 마감되지 않은 날(오늘, 자정 후 5분 안의 어제)은 원본에서 실시간 계산하고, 마감된 날은 일별 집계에서 읽는다.
 * - 원본 보관 기간 밖이고 집계도 없는 날은 0.
 * - topPaths·topReferrers: 범위가 모두 보관 기간 안이면 원본에서 정확히, 아니면 일별 상위 20개 합산(근사).
 */
export async function getVisitStats(query, now = Date.now()) {
  const today = toKstDateKey(new Date(now));
  const { from, to } = resolveStatsRange(query, today);
  const top = query.top ?? DEFAULT_TOP;

  await runRollup(now);

  const finalizedEnd = lastFinalizedDateKey(now);
  const retentionStart = rawRetentionStartKey(now);
  const keys = dateKeysInRange(from, to);

  const stored = await VisitDailyStat.find({ dateKey: mongoose.trusted({ $gte: from, $lte: to }) }).lean();
  const byDate = new Map(stored.map((doc) => [doc.dateKey, doc]));
  for (const key of keys.filter((dateKey) => dateKey > finalizedEnd)) {
    byDate.set(key, await aggregateRawStats({ dateKey: key }));
  }
  const days = keys.map((key) => ({ key, stats: byDate.get(key) ?? emptyDayStats() }));

  const daily = days.map(({ key, stats }) => ({
    date: key,
    pageviews: stats.pageviews,
    uniqueVisitors: stats.uniqueVisitors,
  }));
  const pageviews = daily.reduce((sum, day) => sum + day.pageviews, 0);
  const dailyUniqueVisitorsSum = daily.reduce((sum, day) => sum + day.uniqueVisitors, 0);

  const devices = Object.fromEntries(DEVICE_TYPES.map((type) => [type, 0]));
  for (const { stats } of days) for (const type of DEVICE_TYPES) devices[type] += stats.devices?.[type] ?? 0;

  const approximateTopLists = from < retentionStart;
  let topPaths;
  let topReferrers;
  if (approximateTopLists) {
    topPaths = mergeTopLists(days.map(({ stats }) => stats.topPaths ?? []), 'path', 'pageviews', top);
    topReferrers = mergeTopLists(days.map(({ stats }) => stats.topReferrers ?? []), 'host', 'count', top);
  } else {
    ({ topPaths, topReferrers } = await aggregateRawStats({ dateKey: { $gte: from, $lte: to } }, top));
  }

  return {
    range: { from, to, timezone: KST_TIMEZONE },
    summary: {
      pageviews,
      dailyUniqueVisitorsSum,
      avgDailyUniqueVisitors: Math.round((dailyUniqueVisitorsSum / keys.length) * 10) / 10,
    },
    daily,
    topPaths,
    topReferrers,
    devices,
    dataQuality: { includesToday: to === today, approximateTopLists },
  };
}
