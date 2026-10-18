import { useMemo, useState } from 'react'
import { Icon } from '../common/Icon.jsx'
import { Reveal } from '../common/Reveal.jsx'
import { EmptyState, ErrorState, LoadingState } from '../common/StateView.jsx'
import { Badge, Button, Notice, SceneLabel, Tag } from '../common/ui.jsx'
import { usePagedList } from '../hooks/usePagedList.js'
import { useDebouncedValue } from '../hooks/useReveal.js'
import { useI18n } from '../i18n/context.js'
import { formatTags, projectArt } from '../lib/content.js'
import { pad2 } from '../lib/format.js'
import { Link } from '../lib/router.jsx'
import { api } from '../services/api.js'

const PAGE_SIZE = 6
const SORTS = [
  { value: '', labelKey: 'projects.sortDefault' },
  { value: '-startedAt', labelKey: 'projects.sortLatest' },
  { value: 'title', labelKey: 'projects.sortTitle' },
]
const MAX_TECH_CHIPS = 8

export function ProjectStatusBadge({ project }) {
  const { t } = useI18n()
  return project.endedAt ? (
    <Badge tone="lilac">{t('projects.completed')}</Badge>
  ) : (
    <Badge tone="aqua">{t('projects.ongoing')}</Badge>
  )
}

function ProjectBand({ project, index }) {
  const { t } = useI18n()
  const art = projectArt(index)
  const reversed = index % 2 === 1
  const image = project.thumbnailUrl || art.src

  return (
    <article className={`project-band project-band--${art.tone}${reversed ? ' is-reversed' : ''}`}>
      <div className="project-band__media" aria-hidden={project.thumbnailUrl ? undefined : true}>
        <img
          src={image}
          alt={project.thumbnailUrl ? t('projects.imageAlt', { title: project.title }) : ''}
          loading="lazy"
        />
        <span className="ghost-number project-band__ghost">{pad2(index + 1)}</span>
      </div>
      <Reveal className="project-band__body">
        <p className="project-band__meta">
          <span className="project-band__ep">EP.{pad2(index + 1)}</span>
          <span className="project-band__rule" aria-hidden="true" />
          <ProjectStatusBadge project={project} />
          {project.featured ? (
            <Badge tone="amber" dot={false}>
              {t('projects.featured')}
            </Badge>
          ) : null}
        </p>
        <h3 className="project-band__title">{project.title}</h3>
        {project.tags?.length ? <p className="project-band__subtitle">{formatTags(project.tags)}</p> : null}
        <p className="project-band__summary">{project.summary}</p>
        {project.skills?.length ? (
          <ul className="tag-row">
            {project.skills.map((skill) => (
              <li key={skill.id}>
                <Tag>{skill.name}</Tag>
              </li>
            ))}
          </ul>
        ) : null}
        <Link to={`/projects/${encodeURIComponent(project.slug)}`} className="text-link">
          {t('projects.detail')}
          <Icon name="arrow-right" size={16} />
          <span className="sr-only"> — {project.title}</span>
        </Link>
      </Reveal>
    </article>
  )
}

/** SCENE 04 — PROJECTS: GET /projects (검색 q · 기술 skill · 정렬 sort · 페이지) */
export function ProjectsSection({ skillsQuery }) {
  const { t } = useI18n()
  const [search, setSearch] = useState('')
  const [skill, setSkill] = useState('')
  const [sort, setSort] = useState('')
  const debounced = useDebouncedValue(search.trim(), 350)
  // API 검색어는 2~50자. 1자는 보내지 않고 안내만 한다.
  const q = debounced.length >= 2 ? debounced.slice(0, 50) : ''
  const searchTooShort = search.trim().length === 1

  const list = usePagedList(
    (page, signal) => api.projects({ q, skill, sort, page, limit: PAGE_SIZE }, { signal }),
    [q, skill, sort],
  )

  const techChips = useMemo(() => {
    const skills = skillsQuery.data ?? []
    return skills
      .filter((item) => item.status === 'applied' || item.status === 'proficient' || item.status === 'learning')
      .slice(0, MAX_TECH_CHIPS)
  }, [skillsQuery.data])

  const filtered = Boolean(q || skill)
  const resetFilters = () => {
    setSearch('')
    setSkill('')
    setSort('')
  }

  let content
  if (list.isInitialLoading) {
    content = <LoadingState />
  } else if (list.error && !list.hasLoaded) {
    content = <ErrorState error={list.error} onRetry={list.reload} />
  } else if (list.items.length === 0) {
    content = filtered ? (
      <EmptyState
        icon="search"
        tone="amber"
        title={t('projects.noResult')}
        body={q ? t('projects.noResultHint', { query: q }) : null}
        action={
          <Button variant="amber-outline" size="sm" onClick={resetFilters}>
            {t('projects.resetFilter')}
          </Button>
        }
      />
    ) : (
      <EmptyState icon="folder-open" title={t('projects.empty')} body={t('projects.emptyHint')} />
    )
  } else {
    content = (
      <>
        <div className="project-list">
          {list.items.map((project, index) => (
            <ProjectBand key={project.id} project={project} index={index} />
          ))}
        </div>
        {list.error ? <ErrorState error={list.error} onRetry={list.reload} compact /> : null}
        <div className="container section-foot">
          {list.hasNext ? (
            <Button variant="secondary" icon="arrow-right" onClick={list.loadMore}>
              {t('projects.more')}
            </Button>
          ) : null}
          {list.isLoading && !list.isInitialLoading ? <LoadingState compact /> : null}
          {list.items.some((project) => !project.thumbnailUrl) ? <Notice>{t('projects.artNote')}</Notice> : null}
        </div>
      </>
    )
  }

  return (
    <section id="projects" className="projects" aria-labelledby="projects-title">
      <div className="container">
        <div className="section-head section-head--split">
          <Reveal>
            <SceneLabel tone="sakura">{t('projects.scene')}</SceneLabel>
            <p className="section-kicker">{t('projects.kicker')}</p>
            <h2 id="projects-title" className="section-title">
              <span>{t('projects.titleLine1')}</span>
              <span>{t('projects.titleLine2')}</span>
            </h2>
            <p className="section-lead">{t('projects.lead')}</p>
          </Reveal>
          <p className="section-counter" aria-hidden="true">
            <span className="section-counter__num">{list.meta ? pad2(list.meta.totalItems) : '—'}</span>
            <span className="eyebrow">{t('projects.counter')}</span>
          </p>
        </div>

        <div className="filter-panel" role="search">
          <div className="filter-panel__row">
            <label className="search-box">
              <span className="sr-only">{t('projects.searchLabel')}</span>
              <Icon name="search" size={18} />
              <input
                type="search"
                value={search}
                maxLength={50}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('projects.searchPlaceholder')}
              />
            </label>
            <label className="sort-box">
              <span className="eyebrow">{t('projects.sort')}</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
              <Icon name="chevron-down" size={16} />
            </label>
          </div>
          {searchTooShort ? <p className="filter-panel__hint">{t('projects.searchTooShort')}</p> : null}
          <div className="filter-panel__row filter-panel__row--chips">
            <span className="eyebrow">{t('projects.tech')}</span>
            <div className="chip-filter" role="group" aria-label={t('projects.tech')}>
              <button type="button" className={skill === '' ? 'filter-chip is-active' : 'filter-chip'} aria-pressed={skill === ''} onClick={() => setSkill('')}>
                {t('projects.all')}
              </button>
              {techChips.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={skill === item.slug ? 'filter-chip is-active' : 'filter-chip'}
                  aria-pressed={skill === item.slug}
                  onClick={() => setSkill(item.slug)}
                >
                  {item.name}
                </button>
              ))}
            </div>
            <span className="filter-panel__count" aria-live="polite">
              {list.meta ? t('projects.count', { count: list.meta.totalItems }) : ''}
            </span>
          </div>
        </div>
      </div>
      {content}
    </section>
  )
}
