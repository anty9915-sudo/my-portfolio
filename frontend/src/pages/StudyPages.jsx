import { useMemo, useState } from 'react'
import { Icon } from '../common/Icon.jsx'
import { Markdown } from '../common/Markdown.jsx'
import { EmptyState, ErrorState, LoadingState, Skeleton } from '../common/StateView.jsx'
import { Badge, Button, SceneLabel, Tag } from '../common/ui.jsx'
import { useApi } from '../hooks/useApi.js'
import { useDocumentTitle } from '../hooks/useDocumentTitle.js'
import { useDebouncedValue } from '../hooks/useReveal.js'
import { useI18n } from '../i18n/context.js'
import { SCENES } from '../lib/content.js'
import { formatDate } from '../lib/format.js'
import { parseMarkdown } from '../lib/markdown.js'
import { Link } from '../lib/router.jsx'
import { api } from '../services/api.js'
import { StudyRow } from '../sections/StudySection.jsx'
import { NotFoundPage } from './NotFoundPage.jsx'

const PAGE_SIZE = 10
const CATEGORY_FILTERS = [
  { value: '', labelKey: 'study.all' },
  { value: 'study', labelKey: 'study.categoryStudy' },
  { value: 'troubleshooting', labelKey: 'study.categoryTroubleshooting' },
]

function CategoryBadge({ category }) {
  const { t } = useI18n()
  return category === 'troubleshooting' ? (
    <Badge tone="crimson">{t('study.categoryTroubleshooting')}</Badge>
  ) : (
    <Badge tone="amber">{t('study.categoryStudy')}</Badge>
  )
}

/** 학습 기록 목록: GET /study-records (q · category · page) */
export function StudyListPage() {
  const { t } = useI18n()
  useDocumentTitle(t('study.listTitle'))
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [pageState, setPageState] = useState({ key: '', page: 1 })
  const debounced = useDebouncedValue(search.trim(), 350)
  const q = debounced.length >= 2 ? debounced.slice(0, 50) : ''
  const filterKey = `${q}|${category}`
  // 검색·분류가 바뀌면 1페이지부터 다시 본다
  const page = pageState.key === filterKey ? pageState.page : 1
  const query = useApi((signal) => api.studyRecords({ q, category, page, limit: PAGE_SIZE }, { signal }), [q, category, page])
  const meta = query.meta
  const totalPages = meta?.totalPages ?? 1

  const goToPage = (next) => {
    setPageState({ key: filterKey, page: next })
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  let body
  if (query.status === 'error') body = <ErrorState error={query.error} onRetry={query.reload} />
  else if (!query.hasLoaded) body = <LoadingState />
  else if (!query.data.length) {
    body = (q || category) ? (
      <EmptyState
        icon="search"
        tone="amber"
        title={t('projects.noResult')}
        action={
          <Button variant="amber-outline" size="sm" onClick={() => { setSearch(''); setCategory('') }}>
            {t('projects.resetFilter')}
          </Button>
        }
      />
    ) : (
      <EmptyState icon="book" title={t('study.empty')} body={t('study.emptyHint')} />
    )
  } else {
    const offset = (meta.page - 1) * meta.limit
    body = (
      <>
        <ol className={query.isLoading ? 'study-list is-stale' : 'study-list'}>
          {query.data.map((record, index) => (
            <StudyRow key={record.id} record={record} number={meta.totalItems - offset - index} index={index} />
          ))}
        </ol>
        {totalPages > 1 ? (
          <nav className="pager" aria-label="Pagination">
            <Button variant="secondary" size="sm" iconLeft="chevron-left" disabled={page <= 1 || query.isLoading} onClick={() => goToPage(page - 1)}>
              {t('study.prev')}
            </Button>
            <span className="pager__status">{t('study.page', { page: meta.page, total: totalPages })}</span>
            <Button variant="secondary" size="sm" icon="chevron-right" disabled={!meta.hasNext || query.isLoading} onClick={() => goToPage(page + 1)}>
              {t('study.next')}
            </Button>
          </nav>
        ) : null}
      </>
    )
  }

  return (
    <section className="study study--page" aria-labelledby="study-page-title">
      <div className="study__bg" aria-hidden="true" style={{ backgroundImage: `url(${SCENES.study})` }} />
      <div className="container study__inner">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/">{t('detail.breadcrumbHome')}</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">STUDY</span>
        </nav>
        <div className="section-head section-head--split">
          <div className="enter" style={{ '--i': 1 }}>
            <SceneLabel tone="amber">{t('study.kicker')}</SceneLabel>
            <h1 id="study-page-title" className="section-title">
              {t('study.title')}
            </h1>
            <p className="section-lead">{t('study.lead')}</p>
          </div>
          {meta ? <p className="eyebrow study__count">{t('study.entries', { count: meta.totalItems })}</p> : null}
        </div>
        <div className="filter-panel filter-panel--study" role="search">
          <div className="filter-panel__row">
            <label className="search-box">
              <span className="sr-only">{t('study.searchLabel')}</span>
              <Icon name="search" size={18} />
              <input type="search" value={search} maxLength={50} placeholder={t('study.searchPlaceholder')} onChange={(event) => setSearch(event.target.value)} />
            </label>
          </div>
          {search.trim().length === 1 ? <p className="filter-panel__hint">{t('projects.searchTooShort')}</p> : null}
          <div className="filter-panel__row filter-panel__row--chips">
            <div className="chip-filter" role="group" aria-label="Category">
              {CATEGORY_FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={category === option.value ? 'filter-chip is-active' : 'filter-chip'}
                  aria-pressed={category === option.value}
                  onClick={() => setCategory(option.value)}
                >
                  {t(option.labelKey)}
                </button>
              ))}
            </div>
          </div>
        </div>
        {body}
      </div>
    </section>
  )
}

/** 학습 기록 상세: GET /study-records/:slug */
export function StudyDetailPage({ slug }) {
  const { t } = useI18n()
  const query = useApi((signal) => api.studyRecord(slug, { signal }), [slug])
  const record = query.data
  useDocumentTitle(record?.title)
  const blocks = useMemo(() => (record ? parseMarkdown(record.content) : []), [record])

  if (query.status === 'error' && query.error?.status === 404) return <NotFoundPage />
  if (query.status === 'error') {
    return (
      <div className="page-state">
        <ErrorState error={query.error} onRetry={query.reload} />
      </div>
    )
  }
  if (!record) {
    return (
      <div className="page-state container">
        <Skeleton lines={6} />
      </div>
    )
  }

  return (
    <article className="study-detail">
      <header className="study-detail__hero">
        <div className="study-detail__bg" aria-hidden="true" style={{ backgroundImage: `url(${SCENES.study})` }} />
        <div className="container study-detail__narrow">
          <nav className="breadcrumb enter" style={{ '--i': 0 }} aria-label="Breadcrumb">
            <Link to="/">{t('detail.breadcrumbHome')}</Link>
            <span aria-hidden="true">/</span>
            <Link to="/study">STUDY</Link>
          </nav>
          <p className="study-detail__meta enter" style={{ '--i': 1 }}>
            <CategoryBadge category={record.category} />
            <time dateTime={record.learnedAt}>{formatDate(record.learnedAt)}</time>
          </p>
          <h1 className="study-detail__title enter" style={{ '--i': 2 }}>
            {record.title}
          </h1>
          {record.summary ? (
            <p className="study-detail__summary enter" style={{ '--i': 3 }}>
              {record.summary}
            </p>
          ) : null}
          {record.skills?.length || record.tags?.length ? (
            <ul className="tag-row enter" style={{ '--i': 4 }}>
              {record.skills?.map((skill) => (
                <li key={skill.id}>
                  <Tag>{skill.name}</Tag>
                </li>
              ))}
              {record.tags?.map((tag) => (
                <li key={tag}>
                  <Tag mono>#{tag}</Tag>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </header>
      <div className="container study-detail__narrow study-detail__body">
        <Markdown blocks={blocks} />
        {record.relatedProjects?.length ? (
          <aside className="study-detail__related">
            <p className="eyebrow eyebrow--aqua">{t('study.relatedProjects')}</p>
            <ul className="related-list">
              {record.relatedProjects.map((project) => (
                <li key={project.id}>
                  <Link to={`/projects/${encodeURIComponent(project.slug)}`} className="related-list__item">
                    <Icon name="folder" size={16} />
                    <span>{project.title}</span>
                    <Icon name="arrow-right" size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
        <p className="study-detail__foot">
          <Link to="/study" className="text-link">
            <Icon name="arrow-left" size={16} />
            {t('study.back')}
          </Link>
          <span className="detail-content__updated">{t('detail.updated', { date: formatDate(record.updatedAt) })}</span>
        </p>
      </div>
    </article>
  )
}
