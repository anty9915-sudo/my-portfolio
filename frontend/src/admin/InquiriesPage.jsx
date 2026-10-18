import { useState } from 'react'
import { Icon } from '../common/Icon.jsx'
import { EmptyState, ErrorState, LoadingState } from '../common/StateView.jsx'
import { useToast } from '../common/toastContext.js'
import { Badge, Button, IconButton, SelectInput, TextInput } from '../common/ui.jsx'
import { useApi } from '../hooks/useApi.js'
import { useDebouncedValue } from '../hooks/useReveal.js'
import { INQUIRY_STATUS } from '../lib/content.js'
import { formatDate, formatDateTime } from '../lib/format.js'
import { api } from '../services/api.js'
import { adminErrorMessage, useAdmin } from './adminContext.js'
import { Card, ConfirmDeleteModal, FormMessage, PageHeader, Pagination } from './parts.jsx'

const PAGE_SIZE = 20
const STATUS_KEYS = ['new', 'read', 'replied', 'archived']
const STATUS_OPTIONS = STATUS_KEYS.map((value) => ({ value, label: INQUIRY_STATUS[value].label }))

function StatusBadge({ status }) {
  const info = INQUIRY_STATUS[status] ?? { label: status, tone: 'muted' }
  return <Badge tone={info.tone}>{info.label}</Badge>
}

/** 문의 상세 패널: GET /admin/inquiries/:id · PATCH(상태·메모) · DELETE */
function InquiryDetail({ id, onClose, onChanged, onDelete }) {
  const { toast } = useToast()
  const query = useApi((signal) => api.admin.inquiry(id, { signal }), [id])
  const inquiry = query.data
  const [edit, setEdit] = useState({ sourceKey: null, status: '', adminMemo: '' })
  const [state, setState] = useState({ status: 'idle', message: '' })
  const sourceKey = inquiry ? `${inquiry.id}:${inquiry.updatedAt}` : null
  const current = edit.sourceKey === sourceKey ? edit : { sourceKey, status: inquiry?.status ?? 'new', adminMemo: inquiry?.adminMemo ?? '' }
  const changed = inquiry && (current.status !== inquiry.status || (current.adminMemo.trim() || null) !== (inquiry.adminMemo ?? null))

  const save = async () => {
    const body = {}
    if (current.status !== inquiry.status) body.status = current.status
    const memo = current.adminMemo.trim() || null
    if (memo !== (inquiry.adminMemo ?? null)) body.adminMemo = memo
    setState({ status: 'saving', message: '' })
    try {
      const { data } = await api.admin.updateInquiry(inquiry.id, body)
      query.setData(data)
      setState({ status: 'idle', message: '' })
      toast({ title: '저장되었습니다', body: '처리 상태와 메모를 저장했습니다.' })
      onChanged(data)
    } catch (error) {
      setState({ status: 'error', message: adminErrorMessage(error) })
    }
  }

  return (
    <Card className="inquiry-detail">
      <div className="inquiry-detail__head">
        <p className="eyebrow eyebrow--aqua">INQUIRY DETAIL</p>
        <IconButton icon="x" label="상세 닫기" onClick={onClose} />
      </div>
      {query.status === 'error' ? (
        <ErrorState error={query.error} onRetry={query.reload} compact />
      ) : !inquiry ? (
        <LoadingState compact />
      ) : (
        <>
          <h2 className="inquiry-detail__subject">{inquiry.subject || '(제목 없음)'}</h2>
          <p className="inquiry-detail__meta">
            <time dateTime={inquiry.createdAt}>{formatDateTime(inquiry.createdAt)}</time>
            <StatusBadge status={inquiry.status} />
          </p>
          <dl className="meta-list">
            <div>
              <dt>이름</dt>
              <dd>{inquiry.name}</dd>
            </div>
            <div>
              <dt>이메일</dt>
              <dd className="cell-mono">{inquiry.email}</dd>
            </div>
            <div>
              <dt>동의 버전</dt>
              <dd className="cell-mono">{inquiry.consent?.version ?? '—'}</dd>
            </div>
            <div>
              <dt>자동 삭제 예정</dt>
              <dd className="cell-mono">{formatDate(inquiry.expiresAt)}</dd>
            </div>
          </dl>
          <p className="inquiry-detail__message">{inquiry.message}</p>
          <SelectInput label="처리 상태" value={current.status} options={STATUS_OPTIONS} onChange={(event) => setEdit({ ...current, status: event.target.value })} />
          <TextInput label="관리자 메모" multiline rows={3} maxLength={1000} value={current.adminMemo} onChange={(event) => setEdit({ ...current, adminMemo: event.target.value })} placeholder="회신 내용 등을 기록해 두세요 (방문자에게 보이지 않음)" />
          <FormMessage>{state.status === 'error' ? state.message : ''}</FormMessage>
          <div className="inquiry-detail__actions">
            <Button variant="secondary" onClick={save} loading={state.status === 'saving'} disabled={!changed}>
              상태 · 메모 저장
            </Button>
            <Button variant="solid-aqua" iconLeft="mail" href={`mailto:${inquiry.email}?subject=${encodeURIComponent(`Re: ${inquiry.subject ?? '문의'}`)}`}>
              메일로 회신
            </Button>
          </div>
          <p className="field__hint">메일 앱에서 회신한 뒤 상태를 &apos;회신 완료&apos;로 바꿔 주세요. 상세를 열어도 상태는 자동으로 바뀌지 않습니다.</p>
          <Button variant="danger-outline" size="sm" iconLeft="trash" onClick={() => onDelete(inquiry)}>
            문의 즉시 삭제
          </Button>
        </>
      )}
    </Card>
  )
}

/** 09 · 문의 관리: GET /admin/inquiries (status · q · page) */
export function InquiriesPage() {
  const { toast } = useToast()
  const { refreshInquiryCount } = useAdmin()
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [pageState, setPageState] = useState({ key: '', page: 1 })
  const [selectedId, setSelectedId] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [tick, setTick] = useState(0)
  const debounced = useDebouncedValue(search.trim(), 300)
  const q = debounced.length >= 2 ? debounced : ''
  const filterKey = `${q}|${status}`
  const page = pageState.key === filterKey ? pageState.page : 1
  const list = useApi((signal) => api.admin.inquiries({ q, status, page, limit: PAGE_SIZE }, { signal }), [q, status, page, tick])
  // 탭의 상태별 개수: 상태마다 1건만 조회해 meta.totalItems로 센다
  const counts = useApi(
    (signal) =>
      Promise.all([undefined, ...STATUS_KEYS].map((key) => api.admin.inquiries({ status: key, limit: 1 }, { signal }))).then((results) => ({
        data: Object.fromEntries(['', ...STATUS_KEYS].map((key, index) => [key, results[index].meta.totalItems])),
        meta: null,
      })),
    [tick],
  )
  const inquiries = list.data ?? []

  const refresh = () => {
    setTick((value) => value + 1)
    refreshInquiryCount()
  }

  const confirmDelete = async () => {
    await api.admin.deleteInquiry(deleting.id)
    toast({ title: '삭제되었습니다', body: '문의를 즉시 삭제했습니다.' })
    if (selectedId === deleting.id) setSelectedId(null)
    setDeleting(null)
    refresh()
  }

  let body
  if (list.status === 'error') body = <ErrorState error={list.error} onRetry={list.reload} />
  else if (!list.hasLoaded) body = <LoadingState compact />
  else if (!inquiries.length) body = <EmptyState icon="mail" title={q || status ? '조건에 맞는 문의가 없습니다' : '아직 받은 문의가 없습니다'} />
  else {
    body = (
      <>
        <ul className={list.isLoading ? 'inquiry-list is-stale' : 'inquiry-list'}>
          {inquiries.map((inquiry) => (
            <li key={inquiry.id} className={selectedId === inquiry.id ? 'inquiry-row is-selected' : 'inquiry-row'}>
              <button type="button" className="inquiry-row__main" onClick={() => setSelectedId(inquiry.id)} aria-label={`${inquiry.name}의 문의 열기`}>
                <span className="cell-mono">{formatDate(inquiry.createdAt)}</span>
                <span className="inquiry-row__name">{inquiry.name}</span>
                <span className="cell-mono inquiry-row__email">{inquiry.email}</span>
                <span className="inquiry-row__subject">{inquiry.subject || inquiry.messagePreview}</span>
              </button>
              <StatusBadge status={inquiry.status} />
              <span className="row-actions">
                <IconButton icon="eye" label="상세 보기" onClick={() => setSelectedId(inquiry.id)} />
                <IconButton icon="trash" label="삭제" variant="danger" onClick={() => setDeleting(inquiry)} />
              </span>
            </li>
          ))}
        </ul>
        <div className="table-foot">
          <span>{list.meta?.totalItems ?? 0}건</span>
          <Pagination meta={list.meta} page={page} onPage={(next) => setPageState({ key: filterKey, page: next })} disabled={list.isLoading} />
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader title="문의 관리" description="방문자 문의를 확인하고 처리 상태를 관리합니다. 문의는 접수 후 180일이 지나면 자동 삭제됩니다." />
      <div className={selectedId ? 'inquiry-layout has-detail' : 'inquiry-layout'}>
        <Card
          title="문의 목록"
          icon="mail"
          actions={
            <div className="tabs" role="group" aria-label="처리 상태">
              {['', ...STATUS_KEYS].map((key) => (
                <button key={key} type="button" className={status === key ? 'filter-chip is-active' : 'filter-chip'} aria-pressed={status === key} onClick={() => setStatus(key)}>
                  {key ? INQUIRY_STATUS[key].label : '전체'}
                  <span className="filter-chip__count">{counts.data?.[key] ?? '·'}</span>
                </button>
              ))}
            </div>
          }
        >
          <label className="search-box admin-search">
            <Icon name="search" size={17} />
            <span className="sr-only">문의 검색</span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="이름·이메일·제목 검색 (2자 이상)" />
          </label>
          {body}
        </Card>
        {selectedId ? <InquiryDetail key={selectedId} id={selectedId} onClose={() => setSelectedId(null)} onChanged={refresh} onDelete={setDeleting} /> : null}
      </div>
      <ConfirmDeleteModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="문의를 삭제할까요?"
        name={deleting ? `${deleting.name} · ${deleting.email}` : ''}
        description="보관 기간과 관계없이 즉시 영구 삭제됩니다. 문의자의 삭제 요청에 대응할 때 사용하세요."
        onConfirm={confirmDelete}
      />
    </>
  )
}
