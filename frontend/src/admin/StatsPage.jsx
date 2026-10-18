import { useState } from 'react'
import { Icon } from '../common/Icon.jsx'
import { ErrorState, LoadingState } from '../common/StateView.jsx'
import { Notice } from '../common/ui.jsx'
import { useApi } from '../hooks/useApi.js'
import { formatNumber, kstDateKey } from '../lib/format.js'
import { api } from '../services/api.js'
import { Card, PageHeader } from './parts.jsx'

const RANGES = [7, 14, 30]
const DEVICE_LABEL = { desktop: '데스크톱', mobile: '모바일', tablet: '태블릿', unknown: '알 수 없음' }

export function StatCard({ label, value, caption, icon, tone = 'aqua' }) {
  return (
    <div className={`stat-card stat-card--${tone}`}>
      <p className="stat-card__head">
        <span className="eyebrow">{label}</span>
        <Icon name={icon} size={17} />
      </p>
      <p className="stat-card__value">{value}</p>
      <p className="stat-card__caption">{caption}</p>
    </div>
  )
}

/** 일별 페이지뷰 막대 그래프 (마지막 날 강조) */
export function DailyChart({ daily }) {
  const max = Math.max(1, ...daily.map((day) => day.pageviews))
  const dense = daily.length > 16
  return (
    <figure className="bar-chart" aria-label="일별 페이지뷰">
      <ol className={dense ? 'bar-chart__bars is-dense' : 'bar-chart__bars'}>
        {daily.map((day, index) => {
          const last = index === daily.length - 1
          return (
            <li key={day.date} className={last ? 'bar-chart__item is-last' : 'bar-chart__item'} title={`${day.date} · 페이지뷰 ${day.pageviews} · 고유 방문자 ${day.uniqueVisitors}`}>
              {!dense || last ? <span className="bar-chart__value">{day.pageviews}</span> : null}
              <span className="bar-chart__bar" style={{ height: `${Math.max(2, (day.pageviews / max) * 100)}%` }} />
              <span className="bar-chart__label">{day.date.slice(8)}</span>
              <span className="sr-only">
                {day.date}: 페이지뷰 {day.pageviews}, 고유 방문자 {day.uniqueVisitors}
              </span>
            </li>
          )
        })}
      </ol>
    </figure>
  )
}

function RankList({ title, items, labelKey, valueKey, empty }) {
  const max = Math.max(1, ...items.map((item) => item[valueKey]))
  return (
    <Card title={title}>
      {items.length ? (
        <ol className="rank-list">
          {items.map((item) => (
            <li key={item[labelKey]}>
              <span className="rank-list__label">{item[labelKey]}</span>
              <span className="rank-list__bar" style={{ width: `${(item[valueKey] / max) * 100}%` }} aria-hidden="true" />
              <span className="rank-list__value">{formatNumber(item[valueKey])}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="field__hint">{empty}</p>
      )}
    </Card>
  )
}

/** 09 · 방문 통계: GET /admin/stats/visits?from&to&top */
export function StatsPage() {
  const [range, setRange] = useState({ mode: 7, from: kstDateKey(-6), to: kstDateKey() })
  const days = range.mode === 'custom' ? null : range.mode
  const from = days ? kstDateKey(-(days - 1)) : range.from
  const to = days ? kstDateKey() : range.to
  const query = useApi((signal) => api.admin.visitStats({ from, to, top: 10 }, { signal }), [from, to])
  const stats = query.data

  return (
    <>
      <PageHeader title="방문 통계" description="IP·User-Agent 원문을 저장하지 않는 일별 집계입니다. 고유 방문자는 하루 단위로만 정확합니다." />
      <div className="admin-filter">
        <div className="tabs" role="group" aria-label="기간">
          {RANGES.map((value) => (
            <button key={value} type="button" className={range.mode === value ? 'filter-chip is-active' : 'filter-chip'} aria-pressed={range.mode === value} onClick={() => setRange({ ...range, mode: value })}>
              {value}일
            </button>
          ))}
          <button type="button" className={range.mode === 'custom' ? 'filter-chip is-active' : 'filter-chip'} aria-pressed={range.mode === 'custom'} onClick={() => setRange({ mode: 'custom', from, to })}>
            직접 선택
          </button>
        </div>
        {range.mode === 'custom' ? (
          <div className="date-range">
            <input className="input" type="date" value={range.from} max={range.to} onChange={(event) => setRange({ ...range, from: event.target.value })} aria-label="시작일" />
            <span>~</span>
            <input className="input" type="date" value={range.to} min={range.from} max={kstDateKey()} onChange={(event) => setRange({ ...range, to: event.target.value })} aria-label="종료일" />
          </div>
        ) : null}
      </div>

      {query.status === 'error' ? (
        <ErrorState error={query.error} onRetry={query.reload} />
      ) : !stats ? (
        <LoadingState compact />
      ) : (
        <div className={query.isLoading ? 'stats is-stale' : 'stats'}>
          <div className="stat-grid">
            <StatCard label="PAGEVIEWS" icon="trending-up" value={formatNumber(stats.summary.pageviews)} caption={`${stats.range.from} ~ ${stats.range.to} 페이지뷰`} />
            <StatCard label="DAILY UNIQUE SUM" icon="user" tone="lilac" value={formatNumber(stats.summary.dailyUniqueVisitorsSum)} caption="일별 고유 방문자 합계" />
            <StatCard label="AVG / DAY" icon="chart" tone="sakura" value={formatNumber(stats.summary.avgDailyUniqueVisitors)} caption="일 평균 고유 방문자" />
            <StatCard label="TODAY" icon="clock" tone="amber" value={formatNumber(stats.daily.at(-1)?.pageviews ?? 0)} caption={stats.dataQuality.includesToday ? '오늘 페이지뷰 (실시간 계산)' : '마지막 날 페이지뷰'} />
          </div>
          <Card title="일별 방문 추이" description={`${stats.range.from} ~ ${stats.range.to} (${stats.range.timezone})`}>
            <DailyChart daily={stats.daily} />
          </Card>
          {stats.dataQuality.approximateTopLists ? <Notice tone="amber" icon="info">원본 보관 기간(90일)을 벗어난 날이 포함되어 상위 경로·유입 목록은 근사값입니다.</Notice> : null}
          <div className="stats__lists">
            <RankList title="많이 본 경로" items={stats.topPaths} labelKey="path" valueKey="pageviews" empty="기록된 경로가 없습니다." />
            <RankList title="유입 사이트" items={stats.topReferrers} labelKey="host" valueKey="count" empty="외부에서 들어온 기록이 없습니다." />
            <RankList
              title="기기"
              items={Object.entries(stats.devices).map(([key, count]) => ({ device: DEVICE_LABEL[key] ?? key, count }))}
              labelKey="device"
              valueKey="count"
              empty="기록이 없습니다."
            />
          </div>
        </div>
      )}
    </>
  )
}
