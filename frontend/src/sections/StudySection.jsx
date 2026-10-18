import { Icon } from '../common/Icon.jsx'
import { Reveal } from '../common/Reveal.jsx'
import { EmptyState, ErrorState, Skeleton } from '../common/StateView.jsx'
import { Button, SceneLabel, Tag } from '../common/ui.jsx'
import { useApi } from '../hooks/useApi.js'
import { useI18n } from '../i18n/context.js'
import { SCENES } from '../lib/content.js'
import { formatDate, pad2 } from '../lib/format.js'
import { Link } from '../lib/router.jsx'
import { api } from '../services/api.js'

const HOME_LIMIT = 4
// 썸네일 필드가 없어 서재 일러스트의 다른 부분을 장식으로 보여 준다
const THUMB_POSITIONS = ['20% 40%', '55% 30%', '80% 60%', '35% 75%']

/** 학습 기록 한 줄 (홈·목록 페이지 공용) */
export function StudyRow({ record, number, highlighted = false, index = 0 }) {
  const { t } = useI18n()
  const href = `/study/${encodeURIComponent(record.slug)}`
  const tags = [...(record.skills ?? []).map((skill) => skill.name), ...(record.tags ?? [])]
  return (
    <Reveal as="li" index={index} className={highlighted ? 'study-row is-highlighted' : 'study-row'}>
      <div className="study-row__num">
        <span className="study-row__index">#{pad2(number)}</span>
        <time className="study-row__date" dateTime={record.learnedAt}>
          {formatDate(record.learnedAt)}
        </time>
      </div>
      <div className="study-row__body">
        <h3 className="study-row__title">
          <Link to={href} className="study-row__link">
            {record.title}
          </Link>
        </h3>
        {record.summary ? <p className="study-row__summary">{record.summary}</p> : null}
        {tags.length ? (
          <ul className="tag-row tag-row--small">
            {tags.slice(0, 5).map((tag) => (
              <li key={tag}>
                <Tag mono>{tag}</Tag>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <span
        className="study-row__thumb"
        aria-hidden="true"
        style={{ backgroundImage: `url(${SCENES.study})`, backgroundPosition: THUMB_POSITIONS[index % THUMB_POSITIONS.length] }}
      />
      <span className="study-row__go" aria-hidden="true">
        <Icon name="arrow-right" size={16} />
      </span>
      <span className="sr-only">{t('study.open', { title: record.title })}</span>
    </Reveal>
  )
}

/** SCENE 05 — STUDY: GET /study-records?limit=4 (최신 학습일순) */
export function StudySection() {
  const { t } = useI18n()
  const query = useApi((signal) => api.studyRecords({ limit: HOME_LIMIT }, { signal }), [])
  const total = query.meta?.totalItems ?? 0

  let body
  if (query.status === 'error') body = <ErrorState error={query.error} onRetry={query.reload} />
  else if (!query.hasLoaded) body = <Skeleton lines={4} />
  else if (!query.data.length) body = <EmptyState icon="book" title={t('study.empty')} body={t('study.emptyHint')} />
  else {
    body = (
      <>
        <ol className="study-list">
          {query.data.map((record, index) => (
            <StudyRow key={record.id} record={record} number={total - index} highlighted={index === 0} index={index} />
          ))}
        </ol>
        {total > HOME_LIMIT ? (
          <div className="section-foot">
            <Button variant="secondary" icon="arrow-right" to="/study" className="btn--amber-icon">
              {t('study.more')}
            </Button>
          </div>
        ) : null}
      </>
    )
  }

  return (
    <section id="study" className="study" aria-labelledby="study-title">
      <div className="study__bg" aria-hidden="true" style={{ backgroundImage: `url(${SCENES.study})` }} />
      <div className="container study__inner">
        <div className="section-head section-head--split">
          <Reveal>
            <SceneLabel tone="amber">{t('study.scene')}</SceneLabel>
            <p className="section-kicker">{t('study.kicker')}</p>
            <h2 id="study-title" className="section-title">
              {t('study.title')}
            </h2>
            <p className="section-lead">{t('study.lead')}</p>
          </Reveal>
          {query.hasLoaded ? <p className="eyebrow study__count">{t('study.entries', { count: pad2(total) })}</p> : null}
        </div>
        {body}
      </div>
    </section>
  )
}
