import { useI18n } from '../i18n/context.js'
import { describeError } from '../lib/errors.js'
import { Icon } from './Icon.jsx'
import { Button } from './ui.jsx'

/*
 * 10 · SYSTEM STATES — 로딩·빈 결과·오류. 서버 응답 없이 성공으로 표시하지 않는다.
 */

export function Spinner({ size = 22 }) {
  return <Icon name="loader" size={size} className="spin" />
}

export function LoadingState({ label, compact = false }) {
  const { t } = useI18n()
  return (
    <div className={compact ? 'state state--compact' : 'state'} role="status" aria-live="polite">
      <span className="state__spinner">
        <Spinner />
      </span>
      <p className="state__title">{label ?? t('state.loading')}</p>
      {compact ? null : <p className="state__mono">{t('state.loadingSub')}</p>}
    </div>
  )
}

export function Skeleton({ lines = 3, blocks = 0 }) {
  return (
    <div className="skeleton" aria-hidden="true">
      <span className="skeleton__bar skeleton__bar--short" />
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className="skeleton__bar" style={{ width: `${92 - index * 18}%` }} />
      ))}
      {blocks ? (
        <div className="skeleton__blocks">
          {Array.from({ length: blocks }, (_, index) => (
            <span key={index} className="skeleton__block" />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function EmptyState({ icon = 'folder-open', tone = 'muted', title, body, action }) {
  return (
    <div className="state">
      <span className={`state__icon state__icon--${tone}`}>
        <Icon name={icon} size={22} />
      </span>
      <p className="state__title">{title}</p>
      {body ? <p className="state__body">{body}</p> : null}
      {action ? <div className="state__action">{action}</div> : null}
    </div>
  )
}

export function ErrorState({ error, onRetry, compact = false }) {
  const { t } = useI18n()
  const info = describeError(error, t)
  return (
    <div className={compact ? 'state state--compact' : 'state'} role="alert">
      <span className={`state__icon state__icon--${info.tone ?? 'crimson'}`}>
        <Icon name={info.icon} size={22} />
      </span>
      <p className="state__title">{info.title}</p>
      <p className="state__body">{info.body}</p>
      {error?.requestId ? <p className="state__mono">{t('state.requestId', { id: error.requestId })}</p> : null}
      {onRetry && error?.status !== 404 ? (
        <div className="state__action">
          <Button variant="danger-outline" size="sm" onClick={onRetry} iconLeft="refresh">
            {t('state.retry')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/** useApi 결과를 받아 로딩·오류·빈 결과를 처리하고, 데이터가 있으면 children을 그린다 */
export function AsyncBoundary({ query, isEmpty, empty, loading, children, compact }) {
  if (query.status === 'error') return <ErrorState error={query.error} onRetry={query.reload} compact={compact} />
  if (!query.hasLoaded) return loading ?? <LoadingState compact={compact} />
  if (isEmpty?.(query.data)) return empty ?? null
  return children(query.data, query.meta)
}
