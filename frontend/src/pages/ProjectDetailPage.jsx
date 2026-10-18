import { useMemo } from 'react'
import { Icon } from '../common/Icon.jsx'
import { Markdown } from '../common/Markdown.jsx'
import { Reveal } from '../common/Reveal.jsx'
import { ErrorState, Skeleton } from '../common/StateView.jsx'
import { Badge, Tag } from '../common/ui.jsx'
import { useApi } from '../hooks/useApi.js'
import { useDocumentTitle } from '../hooks/useDocumentTitle.js'
import { useI18n } from '../i18n/context.js'
import { formatTags, projectArt, SCENES, SKILL_CATEGORIES, SKILL_CATEGORY_TONE } from '../lib/content.js'
import { formatDate, formatMonth, pad2 } from '../lib/format.js'
import { parseMarkdown, slugifyHeading } from '../lib/markdown.js'
import { Link } from '../lib/router.jsx'
import { api } from '../services/api.js'
import { ProjectStatusBadge } from '../sections/ProjectsSection.jsx'
import { NotFoundPage } from './NotFoundPage.jsx'

const SECTION_TONES = ['aqua', 'crimson', 'aqua', 'lilac', 'amber', 'crimson', 'lilac', 'amber', 'aqua']

/** description(Markdown)을 큰 제목(#, ##) 기준으로 나눠 번호가 붙은 섹션으로 만든다 */
function splitDescription(description, overviewTitle) {
  const blocks = parseMarkdown(description)
  const sections = []
  let current = { title: overviewTitle, blocks: [] }
  for (const block of blocks) {
    if (block.type === 'heading' && block.level <= 2) {
      if (current.blocks.length) sections.push(current)
      current = { title: block.text, blocks: [] }
    } else {
      current.blocks.push(block)
    }
  }
  if (current.blocks.length || sections.length === 0) sections.push(current)
  return sections
}

function LinkButton({ href, icon, label, pendingLabel, primary }) {
  if (!href) {
    return (
      <span className={primary ? 'btn btn--accent btn--lg is-pending' : 'btn btn--secondary btn--lg is-pending'} aria-disabled="true">
        <Icon name={icon} />
        <span>{label}</span>
        <span className="mini-badge">{pendingLabel}</span>
      </span>
    )
  }
  return (
    <a className={primary ? 'btn btn--accent btn--lg' : 'btn btn--secondary btn--lg'} href={href} target="_blank" rel="noopener noreferrer">
      <Icon name={icon} />
      <span>{label}</span>
      <Icon name="external" size={15} />
    </a>
  )
}

function DetailSection({ id, number, tone, label, title, children }) {
  return (
    <Reveal as="section" id={id} className="detail-section" aria-labelledby={`${id}-title`}>
      <p className={`detail-section__label detail-section__label--${tone}`}>
        <span>{pad2(number)}</span>
        {label ? <span className="detail-section__en">{label}</span> : null}
        <span className="detail-section__rule" aria-hidden="true" />
      </p>
      <h2 id={`${id}-title`} className="detail-section__title">
        {title}
      </h2>
      {children}
    </Reveal>
  )
}

/** 03 · 프로젝트 상세: GET /projects/:slug (+ 다음 프로젝트를 위해 GET /projects) */
export function ProjectDetailPage({ slug }) {
  const { t } = useI18n()
  const query = useApi((signal) => api.project(slug, { signal }), [slug])
  const listQuery = useApi((signal) => api.projects({ limit: 50 }, { signal }), [])
  const project = query.data
  useDocumentTitle(project?.title)

  const order = listQuery.data ?? []
  const position = order.findIndex((item) => item.slug === slug)
  const next = position >= 0 && order.length > 1 ? order[(position + 1) % order.length] : null
  const nextIndex = next ? order.indexOf(next) : -1

  const sections = useMemo(() => {
    if (!project) return []
    const list = splitDescription(project.description, t('detail.overview')).map((section, index) => ({
      id: slugifyHeading(section.title, index),
      title: section.title,
      label: index === 0 ? 'OVERVIEW' : null,
      body: <Markdown blocks={section.blocks} />,
    }))
    if (project.highlights?.length) {
      list.push({
        id: 'highlights',
        title: t('detail.highlights'),
        label: 'HIGHLIGHTS',
        body: (
          <ul className="feature-grid">
            {project.highlights.map((item, index) => (
              <li key={item} className="feature-card" style={{ '--reveal-index': index }}>
                <span className="feature-card__icon" aria-hidden="true">
                  <Icon name="check" size={16} />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ),
      })
    }
    if (project.skills?.length) {
      const groups = SKILL_CATEGORIES.map((category) => ({
        category,
        skills: project.skills.filter((skill) => skill.category === category),
      })).filter((group) => group.skills.length)
      list.push({
        id: 'tech',
        title: t('detail.tech'),
        label: 'TECH',
        body: (
          <dl className="tech-rows">
            {groups.map((group) => (
              <div key={group.category} className="tech-rows__row">
                <dt className={`eyebrow eyebrow--${SKILL_CATEGORY_TONE[group.category]}`}>{t(`skillCategory.${group.category}`)}</dt>
                <dd>
                  <ul className="tag-row">
                    {group.skills.map((skill) => (
                      <li key={skill.id}>
                        <Tag>{skill.name}</Tag>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>
        ),
      })
    }
    if (project.role) {
      list.push({
        id: 'role',
        title: t('detail.roleTitle'),
        label: 'ROLE',
        body: (
          <ul className="role-card">
            {project.role
              .split(/\s*[·,/]\s*|\n/)
              .filter(Boolean)
              .map((item) => (
                <li key={item}>{item}</li>
              ))}
          </ul>
        ),
      })
    }
    if (project.relatedStudyRecords?.length) {
      list.push({
        id: 'related',
        title: t('detail.related'),
        label: 'LEARNED',
        body: (
          <ul className="related-list">
            {project.relatedStudyRecords.map((record) => (
              <li key={record.id}>
                <Link to={`/study/${encodeURIComponent(record.slug)}`} className="related-list__item">
                  <time dateTime={record.learnedAt}>{formatDate(record.learnedAt)}</time>
                  <span>{record.title}</span>
                  <Icon name="arrow-right" size={16} />
                </Link>
              </li>
            ))}
          </ul>
        ),
      })
    }
    list.push({
      id: 'links',
      title: t('detail.links'),
      label: 'LINKS',
      body: (
        <div className="link-cards">
          {[
            { key: 'github', href: project.githubUrl, icon: 'github', title: t('detail.github'), desc: t('detail.githubDesc') },
            { key: 'demo', href: project.demoUrl, icon: 'external', title: t('detail.demo'), desc: t('detail.demoDesc') },
          ].map((item) => {
            const inner = (
              <>
                <span className="link-card__icon">
                  <Icon name={item.icon} size={18} />
                </span>
                <span className="link-card__text">
                  <span className="link-card__title">{item.title}</span>
                  <span className="link-card__desc">{item.desc}</span>
                </span>
                {item.href ? <Icon name="arrow-right" size={16} /> : <span className="mini-badge">{t('detail.linkPending')}</span>}
              </>
            )
            return item.href ? (
              <a key={item.key} className="link-card" href={item.href} target="_blank" rel="noopener noreferrer">
                {inner}
              </a>
            ) : (
              <div key={item.key} className="link-card is-pending">
                {inner}
              </div>
            )
          })}
        </div>
      ),
    })
    return list
  }, [project, t])

  if (query.status === 'error' && query.error?.status === 404) return <NotFoundPage />
  if (query.status === 'error') {
    return (
      <div className="page-state">
        <ErrorState error={query.error} onRetry={query.reload} />
      </div>
    )
  }
  if (!project) {
    return (
      <div className="page-state container">
        <Skeleton lines={5} blocks={3} />
      </div>
    )
  }

  const hero = project.thumbnailUrl || SCENES.detail
  const period = `${formatMonth(project.startedAt)} — ${project.endedAt ? formatMonth(project.endedAt) : t('detail.ongoing')}`
  const type = project.teamSize ? (project.teamSize === 1 ? t('detail.solo') : t('detail.team', { count: project.teamSize })) : t('detail.unknown')
  const stack = project.skills?.slice(0, 3).map((skill) => skill.name).join(' · ') || t('detail.unknown')
  const episode = position >= 0 ? pad2(position + 1) : null

  return (
    <article className="detail">
      <header className="detail-hero">
        <div className="detail-hero__bg" aria-hidden="true">
          <img src={hero} alt="" />
        </div>
        <div className="container detail-hero__inner">
          <nav className="breadcrumb enter" style={{ '--i': 0 }} aria-label="Breadcrumb">
            <Link to="/">{t('detail.breadcrumbHome')}</Link>
            <span aria-hidden="true">/</span>
            <Link to="/#projects">{t('detail.breadcrumbProjects')}</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{project.title.toUpperCase()}</span>
          </nav>
          <p className="project-band__meta enter" style={{ '--i': 1 }}>
            {episode ? <span className="project-band__ep">EP.{episode}</span> : null}
            {episode ? <span className="project-band__rule" aria-hidden="true" /> : null}
            <ProjectStatusBadge project={project} />
            {project.featured ? (
              <Badge tone="amber" dot={false}>
                {t('projects.featured')}
              </Badge>
            ) : null}
          </p>
          <h1 className="detail-hero__title enter" style={{ '--i': 2 }}>
            {project.title}
          </h1>
          {project.tags?.length ? (
            <p className="detail-hero__tags enter" style={{ '--i': 3 }}>
              {formatTags(project.tags)}
            </p>
          ) : null}
          <p className="detail-hero__summary enter" style={{ '--i': 3 }}>
            {project.summary}
          </p>
          <div className="detail-hero__actions enter" style={{ '--i': 4 }}>
            <LinkButton primary href={project.githubUrl} icon="github" label={t('detail.github')} pendingLabel={t('detail.linkPending')} />
            <LinkButton href={project.demoUrl} icon="external" label={t('detail.demo')} pendingLabel={t('detail.linkPending')} />
          </div>
          <dl className="detail-meta enter" style={{ '--i': 5 }}>
            {[
              [t('detail.period'), t('detail.periodSub'), period],
              [t('detail.role'), t('detail.roleSub'), project.role || t('detail.unknown')],
              [t('detail.type'), t('detail.typeSub'), type],
              [t('detail.stack'), t('detail.stackSub'), stack],
            ].map(([label, sub, value]) => (
              <div key={label} className="detail-meta__item">
                <dt>
                  <span className="eyebrow eyebrow--aqua">{label}</span> <span className="detail-meta__sub">{sub}</span>
                </dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      <div className="detail-body">
        <div className="container detail-body__grid">
          <nav className="toc" aria-label={t('detail.contents')}>
            <p className="eyebrow">{t('detail.contents')}</p>
            <ol>
              {sections.map((section, index) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="toc__link">
                    <span className="toc__num">{pad2(index + 1)}</span>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="detail-content">
            {sections.map((section, index) => (
              <DetailSection
                key={section.id}
                id={section.id}
                number={index + 1}
                tone={SECTION_TONES[index % SECTION_TONES.length]}
                label={section.label}
                title={section.title}
              >
                {section.body}
              </DetailSection>
            ))}
            <p className="detail-content__updated">{t('detail.updated', { date: formatDate(project.updatedAt) })}</p>
          </div>
        </div>
      </div>

      {next ? (
        <section className="next-project" aria-label={t('detail.nextProject')}>
          <div className="next-project__bg" aria-hidden="true" style={{ backgroundImage: `url(${next.thumbnailUrl || projectArt(nextIndex).src})` }} />
          <div className="container next-project__inner">
            <div>
              <p className="eyebrow eyebrow--lilac">
                {t('detail.nextProject')} — EP.{pad2(nextIndex + 1)}
              </p>
              <p className="next-project__title">{next.title}</p>
              <p className="next-project__summary">{next.summary}</p>
            </div>
            <Link to={`/projects/${encodeURIComponent(next.slug)}`} className="btn btn--lilac-outline btn--lg">
              <span>{t('detail.nextButton')}</span>
              <Icon name="arrow-right" className="btn__trail" />
            </Link>
          </div>
        </section>
      ) : null}
    </article>
  )
}
