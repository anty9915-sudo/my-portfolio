import { Icon } from '../common/Icon.jsx'
import { Reveal } from '../common/Reveal.jsx'
import { EmptyState, ErrorState, Skeleton } from '../common/StateView.jsx'
import { Gauge, SceneLabel } from '../common/ui.jsx'
import { useI18n } from '../i18n/context.js'
import { SKILL_GROUPS, skillIcon } from '../lib/content.js'
import { pad2 } from '../lib/format.js'

const LEGEND = [
  { status: 'applied', tone: 'aqua' },
  { status: 'learning', tone: 'lilac' },
  { status: 'planned', tone: 'muted' },
]

// 공개 응답에는 sortOrder가 없으므로 서버 정렬(분류 → 정렬 순서 → 이름)을 그대로 유지한다
function groupSkills(skills) {
  return SKILL_GROUPS.map((group) => ({
    ...group,
    skills: skills.filter((skill) => group.categories.includes(skill.category)),
  }))
}

/** SCENE 03 — SKILLS: GET /skills (공개 기술 전체, 분류·정렬순) */
export function SkillsSection({ skillsQuery }) {
  const { t } = useI18n()
  const skills = skillsQuery.data ?? []
  const groups = groupSkills(skills)

  let body
  if (skillsQuery.status === 'error') {
    body = <ErrorState error={skillsQuery.error} onRetry={skillsQuery.reload} />
  } else if (!skillsQuery.hasLoaded) {
    body = (
      <div className="skills__grid">
        {SKILL_GROUPS.map((group) => (
          <div key={group.key} className="skill-col">
            <Skeleton lines={3} />
          </div>
        ))}
      </div>
    )
  } else if (skills.length === 0) {
    body = <EmptyState icon="layers" title={t('skills.empty')} body={t('skills.emptyHint')} />
  } else {
    body = (
      <div className="skills__grid">
        {groups.map((group, groupIndex) => (
          <Reveal key={group.key} index={groupIndex} className={`skill-col skill-col--${group.tone}`}>
            <p className="skill-col__meta">
              <span className="skill-col__num">{pad2(groupIndex + 1)}</span>
              <span className="skill-col__rule" aria-hidden="true" />
              <span className="skill-col__count">{pad2(group.skills.length)}</span>
            </p>
            <h3 className="skill-col__title">{t(group.labelKey)}</h3>
            {group.skills.length ? (
              <ul className="skill-list">
                {group.skills.map((skill) => {
                  const statusLabel = t(`skillStatus.${skill.status}`)
                  return (
                    <li key={skill.id} className="skill-item" title={skill.description ?? undefined}>
                      <p className="skill-item__name">
                        <span className="skill-item__icon">
                          <Icon name={skillIcon(skill)} size={16} />
                        </span>
                        {skill.name}
                      </p>
                      <Gauge status={skill.status} tone={group.tone} label={`${skill.name}: ${statusLabel}`} />
                      <p className="skill-item__status">{statusLabel}</p>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="skill-col__empty">{t('skills.groupEmpty')}</p>
            )}
          </Reveal>
        ))}
      </div>
    )
  }

  return (
    <section id="skills" className="skills" aria-labelledby="skills-title">
      <div className="container">
        <div className="section-head section-head--split">
          <Reveal>
            <SceneLabel>{t('skills.scene')}</SceneLabel>
            <p className="section-kicker">{t('skills.kicker')}</p>
            <h2 id="skills-title" className="section-title">
              <span>{t('skills.titleLine1')}</span>
              <span>{t('skills.titleLine2')}</span>
            </h2>
            <p className="section-lead">{t('skills.lead')}</p>
          </Reveal>
          <Reveal index={1} as="aside" className="legend" aria-label={t('skills.legend')}>
            <p className="eyebrow">{t('skills.legend')}</p>
            <ul className="legend__list">
              {LEGEND.map((item) => (
                <li key={item.status} className="legend__item">
                  <span className={`legend__dot legend__dot--${item.tone}`} aria-hidden="true" />
                  <span className="legend__label">{t(`skillStatus.${item.status}`)}</span>
                  <Gauge status={item.status} tone={item.tone} label={t(`skillStatus.${item.status}`)} />
                </li>
              ))}
            </ul>
            <p className="legend__note">{t('skills.legendNote')}</p>
          </Reveal>
        </div>
        {body}
      </div>
    </section>
  )
}
