import { ErrorState, LoadingState } from '../common/StateView.jsx'
import { Badge, Button } from '../common/ui.jsx'
import { useApi } from '../hooks/useApi.js'
import { INQUIRY_STATUS } from '../lib/content.js'
import { formatDate, formatNumber, kstDateKey } from '../lib/format.js'
import { Link } from '../lib/router.jsx'
import { api } from '../services/api.js'
import { Card, PageHeader } from './parts.jsx'
import { DailyChart, StatCard } from './StatsPage.jsx'

/** 대시보드: 여러 관리자 API의 개수(meta.totalItems)와 최근 7일 통계를 모아 보여 준다 */
export function DashboardPage() {
  const summary = useApi(
    (signal) =>
      Promise.all([
        api.admin.projects({ visibility: 'public', limit: 1 }, { signal }),
        api.admin.projects({ limit: 1 }, { signal }),
        api.admin.studyRecords({ visibility: 'public', limit: 1 }, { signal }),
        api.admin.studyRecords({ limit: 1 }, { signal }),
        api.admin.inquiries({ status: 'new', limit: 1 }, { signal }),
        api.admin.skills(undefined, { signal }),
      ]).then(([publicProjects, projects, publicRecords, records, newInquiries, skills]) => ({
        data: {
          publicProjects: publicProjects.meta.totalItems,
          projects: projects.meta.totalItems,
          publicRecords: publicRecords.meta.totalItems,
          records: records.meta.totalItems,
          newInquiries: newInquiries.meta.totalItems,
          skills: skills.meta.totalItems,
        },
        meta: null,
      })),
    [],
  )
  const stats = useApi((signal) => api.admin.visitStats({ from: kstDateKey(-6), to: kstDateKey(), top: 5 }, { signal }), [])
  const recent = useApi((signal) => api.admin.inquiries({ limit: 5 }, { signal }), [])
  const s = summary.data

  return (
    <>
      <PageHeader title="대시보드" description="콘텐츠 현황과 최근 방문·문의를 확인합니다." />
      {summary.status === 'error' ? (
        <ErrorState error={summary.error} onRetry={summary.reload} />
      ) : !s ? (
        <LoadingState compact />
      ) : (
        <div className="stat-grid">
          <StatCard label="PROJECTS" icon="folder" value={formatNumber(s.projects)} caption={`공개 ${s.publicProjects}개 · 비공개 ${s.projects - s.publicProjects}개`} />
          <StatCard label="STUDY LOGS" icon="book" tone="amber" value={formatNumber(s.records)} caption={`공개 ${s.publicRecords}개 · 비공개 ${s.records - s.publicRecords}개`} />
          <StatCard label="SKILLS" icon="layers" tone="lilac" value={formatNumber(s.skills)} caption="등록된 기술" />
          <StatCard label="NEW INQUIRIES" icon="mail" tone="sakura" value={formatNumber(s.newInquiries)} caption="새 문의 (확인 전)" />
        </div>
      )}
      <div className="dashboard-grid">
        <Card title="최근 7일 방문" icon="chart" actions={<Button variant="secondary" size="sm" to="/admin/stats" icon="arrow-right">통계</Button>}>
          {stats.status === 'error' ? (
            <ErrorState error={stats.error} onRetry={stats.reload} compact />
          ) : !stats.data ? (
            <LoadingState compact />
          ) : (
            <>
              <p className="dashboard-total">
                페이지뷰 <strong>{formatNumber(stats.data.summary.pageviews)}</strong> · 일 평균 고유 방문자 <strong>{formatNumber(stats.data.summary.avgDailyUniqueVisitors)}</strong>
              </p>
              <DailyChart daily={stats.data.daily} />
            </>
          )}
        </Card>
        <Card title="최근 문의" icon="mail" actions={<Button variant="secondary" size="sm" to="/admin/inquiries" icon="arrow-right">문의 관리</Button>}>
          {recent.status === 'error' ? (
            <ErrorState error={recent.error} onRetry={recent.reload} compact />
          ) : !recent.data ? (
            <LoadingState compact />
          ) : recent.data.length ? (
            <ul className="mini-list">
              {recent.data.map((inquiry) => (
                <li key={inquiry.id}>
                  <Link to="/admin/inquiries" className="mini-list__item">
                    <span className="cell-mono">{formatDate(inquiry.createdAt)}</span>
                    <span className="mini-list__text">
                      <strong>{inquiry.name}</strong> {inquiry.subject || inquiry.messagePreview}
                    </span>
                    <Badge tone={INQUIRY_STATUS[inquiry.status]?.tone}>{INQUIRY_STATUS[inquiry.status]?.label}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="field__hint">아직 받은 문의가 없습니다.</p>
          )}
        </Card>
      </div>
      <div className="quick-actions">
        <Button variant="solid-aqua" iconLeft="plus" to="/admin/projects/new">
          새 프로젝트
        </Button>
        <Button variant="secondary" iconLeft="plus" to="/admin/study/new">
          학습 기록 작성
        </Button>
        <Button variant="secondary" iconLeft="user" to="/admin/settings">
          프로필 수정
        </Button>
      </div>
    </>
  )
}
