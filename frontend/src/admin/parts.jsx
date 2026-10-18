import { useState } from 'react'
import { Icon } from '../common/Icon.jsx'
import { Modal } from '../common/Modal.jsx'
import { EmptyState } from '../common/StateView.jsx'
import { Badge, Button, IconButton, Toggle } from '../common/ui.jsx'
import { adminErrorMessage } from './adminContext.js'

/** 페이지 머리: 제목 · 설명 · 오른쪽 버튼 */
export function PageHeader({ title, description, back, actions }) {
  return (
    <div className="admin-page-head">
      <div>
        {back}
        <h1 className="admin-page-head__title">{title}</h1>
        {description ? <p className="admin-page-head__desc">{description}</p> : null}
      </div>
      {actions ? <div className="admin-page-head__actions">{actions}</div> : null}
    </div>
  )
}

export function Card({ title, icon, description, actions, tone, className, children }) {
  return (
    <section className={['admin-card', tone && `admin-card--${tone}`, className].filter(Boolean).join(' ')}>
      {title ? (
        <header className="admin-card__head">
          <div>
            <h2 className="admin-card__title">
              {icon ? <Icon name={icon} size={18} /> : null}
              {title}
            </h2>
            {description ? <p className="admin-card__desc">{description}</p> : null}
          </div>
          {actions ? <div className="admin-card__actions">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  )
}

export function VisibilityToggle({ visibility, onChange, disabled }) {
  const isPublic = visibility === 'public'
  return (
    <Toggle
      checked={isPublic}
      onChange={(next) => onChange(next ? 'public' : 'private')}
      label={isPublic ? '공개 — 눌러서 비공개로 전환' : '비공개 — 눌러서 공개로 전환'}
      onLabel="공개"
      offLabel="비공개"
      disabled={disabled}
    />
  )
}

export function RowActions({ onEdit, onDelete, editLabel = '수정', deleteLabel = '삭제', disabled }) {
  return (
    <div className="row-actions">
      {onEdit ? <IconButton icon="pencil" label={editLabel} onClick={onEdit} disabled={disabled} /> : null}
      {onDelete ? <IconButton icon="trash" label={deleteLabel} variant="danger" onClick={onDelete} disabled={disabled} /> : null}
    </div>
  )
}

/**
 * 06 · 삭제 확인: confirmText를 주면 그 값을 정확히 입력해야 삭제 버튼이 켜진다.
 * onConfirm은 서버 응답(204)을 기다리는 Promise를 돌려준다.
 */
export function ConfirmDeleteModal({ open, onClose, title, name, description, confirmText, onConfirm }) {
  const [typed, setTyped] = useState('')
  const [state, setState] = useState({ status: 'idle', message: '' })
  const busy = state.status === 'busy'
  const ready = !confirmText || typed.trim() === confirmText

  const close = () => {
    if (busy) return
    setTyped('')
    setState({ status: 'idle', message: '' })
    onClose()
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!ready || busy) return
    setState({ status: 'busy', message: '' })
    try {
      await onConfirm()
      setTyped('')
      setState({ status: 'idle', message: '' })
    } catch (error) {
      setState({ status: 'error', message: adminErrorMessage(error) })
    }
  }

  return (
    <Modal open={open} onClose={close} title={title} closeDisabled={busy}>
      <form onSubmit={submit}>
        <div className="confirm">
          <span className="confirm__icon">
            <Icon name="trash" size={20} />
          </span>
          <div>
            <p className="confirm__title">{title}</p>
            {name ? <p className="confirm__name">{name}</p> : null}
          </div>
        </div>
        <p className="confirm__body">{description}</p>
        {confirmText ? (
          <label className="field confirm__field">
            <span className="field__label">확인을 위해 이름을 입력하세요</span>
            <input className="input" value={typed} onChange={(event) => setTyped(event.target.value)} placeholder={confirmText} autoComplete="off" />
          </label>
        ) : null}
        {state.status === 'error' ? (
          <p className="form-message form-message--error" role="alert">
            <Icon name="alert" size={16} />
            {state.message}
          </p>
        ) : null}
        <div className="confirm__actions">
          <Button variant="secondary" onClick={close} disabled={busy}>
            취소
          </Button>
          <Button type="submit" variant="danger" iconLeft="trash" loading={busy} disabled={!ready || busy}>
            삭제
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export function Pagination({ meta, page, onPage, disabled }) {
  if (!meta || meta.totalPages <= 1) return null
  return (
    <div className="admin-pager">
      <span>
        {meta.page} / {meta.totalPages} 페이지
      </span>
      <IconButton icon="chevron-left" label="이전 페이지" onClick={() => onPage(page - 1)} disabled={disabled || page <= 1} />
      <IconButton icon="chevron-right" label="다음 페이지" onClick={() => onPage(page + 1)} disabled={disabled || !meta.hasNext} />
    </div>
  )
}

/** 문자열 목록 편집 (주요 성과·목표 등) */
export function ListEditor({ label, items, onChange, max = 10, maxLength = 200, placeholder, error, addLabel = '항목 추가' }) {
  const update = (index, value) => onChange(items.map((item, itemIndex) => (itemIndex === index ? value : item)))
  const remove = (index) => onChange(items.filter((_, itemIndex) => itemIndex !== index))
  const move = (index, delta) => {
    const next = [...items]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  return (
    <div className={error ? 'field has-error' : 'field'}>
      {label ? <span className="field__label">{label}</span> : null}
      <ol className="list-editor">
        {items.map((item, index) => (
          <li key={index} className="list-editor__row">
            <span className="list-editor__num">{String(index + 1).padStart(2, '0')}</span>
            <input className="input" value={item} maxLength={maxLength} placeholder={placeholder} onChange={(event) => update(index, event.target.value)} aria-label={`${label ?? '항목'} ${index + 1}`} />
            <IconButton icon="chevron-up" label="위로" onClick={() => move(index, -1)} disabled={index === 0} />
            <IconButton icon="chevron-down" label="아래로" onClick={() => move(index, 1)} disabled={index === items.length - 1} />
            <IconButton icon="trash" label="삭제" variant="danger" onClick={() => remove(index)} />
          </li>
        ))}
      </ol>
      {items.length < max ? (
        <button type="button" className="list-editor__add" onClick={() => onChange([...items, ''])}>
          <Icon name="plus" size={16} />
          {addLabel}
        </button>
      ) : null}
      {error ? (
        <p className="field__error" role="alert">
          <Icon name="alert" size={14} />
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** 참조 선택 (기술·프로젝트): 선택된 항목은 칩으로, 나머지는 드롭다운으로 추가 */
export function ReferencePicker({ label, options, value, onChange, max, error, emptyLabel = '선택할 항목이 없습니다.' }) {
  const selected = value.map((id) => options.find((option) => option.id === id) ?? { id, label: '(삭제된 항목)' })
  const remaining = options.filter((option) => !value.includes(option.id))
  return (
    <div className={error ? 'field has-error' : 'field'}>
      {label ? <span className="field__label">{label}</span> : null}
      <div className="picker">
        {selected.map((option) => (
          <span key={option.id} className="picker__chip">
            {option.label}
            <button type="button" onClick={() => onChange(value.filter((id) => id !== option.id))} aria-label={`${option.label} 제거`}>
              <Icon name="x" size={13} />
            </button>
          </span>
        ))}
        {remaining.length && (!max || value.length < max) ? (
          <label className="picker__add">
            <Icon name="plus" size={15} />
            <span className="sr-only">{label} 추가</span>
            <select
              value=""
              onChange={(event) => {
                if (event.target.value) onChange([...value, event.target.value])
              }}
            >
              <option value="">추가</option>
              {remaining.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {!options.length ? <span className="picker__empty">{emptyLabel}</span> : null}
      </div>
      {error ? (
        <p className="field__error" role="alert">
          <Icon name="alert" size={14} />
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function VisibilityBadge({ visibility }) {
  return visibility === 'public' ? <Badge tone="aqua">공개</Badge> : <Badge tone="muted">비공개</Badge>
}

export function AdminNotFound() {
  return <EmptyState icon="compass" tone="sakura" title="페이지를 찾을 수 없습니다" body="왼쪽 메뉴에서 이동할 화면을 선택해 주세요." />
}

/** 저장 결과 등 폼 하단 메시지 */
export function FormMessage({ tone = 'error', children }) {
  if (!children) return null
  return (
    <p className={`form-message form-message--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={tone === 'error' ? 'alert' : 'check'} size={16} />
      {children}
    </p>
  )
}
