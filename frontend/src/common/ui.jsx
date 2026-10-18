import { useId } from 'react'
import { SKILL_LEVEL } from '../lib/content.js'
import { Link } from '../lib/router.jsx'
import { Icon } from './Icon.jsx'

/*
 * 04 · COMPONENT — 버튼·입력·배지·토글·언어 전환
 */

const cx = (...names) => names.filter(Boolean).join(' ')

/** variant: primary | secondary | accent | danger | ghost | contact / to가 있으면 내부 링크, href면 외부 링크 */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconLeft,
  to,
  href,
  loading = false,
  block = false,
  className,
  children,
  ...rest
}) {
  const classes = cx('btn', `btn--${variant}`, `btn--${size}`, block && 'btn--block', loading && 'is-loading', className)
  const content = (
    <>
      {loading ? <Icon name="loader" className="spin" /> : iconLeft ? <Icon name={iconLeft} /> : null}
      <span>{children}</span>
      {icon && !loading ? <Icon name={icon} className="btn__trail" /> : null}
    </>
  )
  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {content}
      </Link>
    )
  }
  if (href) {
    return (
      <a href={href} className={classes} target="_blank" rel="noopener noreferrer" {...rest}>
        {content}
      </a>
    )
  }
  return (
    <button type="button" className={classes} disabled={loading || rest.disabled} {...rest}>
      {content}
    </button>
  )
}

export function IconButton({ icon, label, variant = 'ghost', className, ...rest }) {
  return (
    <button type="button" className={cx('icon-btn', `icon-btn--${variant}`, className)} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={17} />
    </button>
  )
}

/** tone: aqua | lilac | crimson | amber | sakura | muted */
export function Badge({ tone = 'muted', dot = true, className, children }) {
  return (
    <span className={cx('badge', `badge--${tone}`, className)}>
      {dot ? <span className="badge__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  )
}

export function Tag({ children, mono = false, className }) {
  return <span className={cx('tag', mono && 'tag--mono', className)}>{children}</span>
}

/** "SCENE 01 — OPENING" 같은 장면 라벨 */
export function SceneLabel({ tone = 'aqua', centered = false, children }) {
  return (
    <p className={cx('scene-label', `scene-label--${tone}`, centered && 'scene-label--centered')}>
      <span className="scene-label__line" aria-hidden="true" />
      <span>{children}</span>
      {centered ? <span className="scene-label__line" aria-hidden="true" /> : null}
    </p>
  )
}

export function Field({ label, error, hint, required, children, className, htmlFor }) {
  return (
    <div className={cx('field', error && 'has-error', className)}>
      {label ? (
        <label className="field__label" htmlFor={htmlFor}>
          {label}
          {required ? <span className="field__required" aria-hidden="true"> *</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="field__error" role="alert">
          <Icon name="alert" size={14} />
          {error}
        </p>
      ) : hint ? (
        <p className="field__hint">{hint}</p>
      ) : null}
    </div>
  )
}

export function TextInput({ label, error, hint, required, className, id, multiline = false, ...rest }) {
  const autoId = useId()
  const inputId = id ?? autoId
  const describedBy = error || hint ? `${inputId}-desc` : undefined
  const Element = multiline ? 'textarea' : 'input'
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className} htmlFor={inputId}>
      <Element
        id={inputId}
        className={cx('input', multiline && 'input--textarea')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        required={required}
        {...rest}
      />
    </Field>
  )
}

export function SelectInput({ label, error, hint, options, className, id, ...rest }) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <Field label={label} error={error} hint={hint} className={className} htmlFor={inputId}>
      <span className="select">
        <select id={inputId} className="input select__input" aria-invalid={error ? true : undefined} {...rest}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" size={16} className="select__chevron" />
      </span>
    </Field>
  )
}

export function Checkbox({ checked, onChange, children, error, id, ...rest }) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <div className={cx('checkbox-field', error && 'has-error')}>
      <label className="checkbox" htmlFor={inputId}>
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={error ? true : undefined}
          {...rest}
        />
        <span className="checkbox__box" aria-hidden="true">
          <Icon name="check" size={14} strokeWidth={2.5} />
        </span>
        <span className="checkbox__label">{children}</span>
      </label>
      {error ? (
        <p className="field__error" role="alert">
          <Icon name="alert" size={14} />
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** 공개/비공개 토글 (role=switch) */
export function Toggle({ checked, onChange, label, onLabel, offLabel, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={cx('toggle', checked && 'is-on')}
      onClick={() => onChange(!checked)}
      disabled={disabled}
    >
      <span className="toggle__track" aria-hidden="true">
        <span className="toggle__thumb" />
      </span>
      {onLabel || offLabel ? <span className="toggle__text">{checked ? onLabel : offLabel}</span> : null}
    </button>
  )
}

/** 상단 안내 띠 (예시 콘텐츠·주의 문구) */
export function Notice({ tone = 'info', icon = 'info', children, className }) {
  return (
    <p className={cx('notice', `notice--${tone}`, className)}>
      <Icon name={icon} size={16} />
      <span>{children}</span>
    </p>
  )
}

/** 상태별 5칸 게이지 (SKILL_LEVEL) */
export function Gauge({ status, tone = 'aqua', segments = 5, label }) {
  const level = SKILL_LEVEL[status] ?? 0
  return (
    <span className={cx('gauge', `gauge--${tone}`)} role="img" aria-label={label}>
      {Array.from({ length: segments }, (_, index) => (
        <span key={index} className={cx('gauge__seg', index < level && 'is-on')} />
      ))}
    </span>
  )
}
