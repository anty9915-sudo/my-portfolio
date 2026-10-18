import { useState } from 'react'
import { Icon } from '../common/Icon.jsx'
import { EmptyState, ErrorState, LoadingState } from '../common/StateView.jsx'
import { useToast } from '../common/toastContext.js'
import { Badge, Button, IconButton } from '../common/ui.jsx'
import { useApi } from '../hooks/useApi.js'
import { useDebouncedValue } from '../hooks/useReveal.js'
import { formatTags, projectArt } from '../lib/content.js'
import { formatDate } from '../lib/format.js'
import { useRouter } from '../lib/routerCore.js'
import { api } from '../services/api.js'
import { adminErrorMessage } from './adminContext.js'
import { ConfirmDeleteModal, PageHeader, Pagination, RowActions, VisibilityToggle } from './parts.jsx'

const PAGE_SIZE = 20
const SORTS = [
  { value: 'sortOrder', label: '직접 정렬' },
  { value: '-updatedAt', label: '최근 수정' },
  { value: '-startedAt', label: '최근 시작' },
  { value: 'title', label: '이름' },
]

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="filter-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon name="chevron-down" size={15} />
    </label>
  )
}

/** 05 · 프로젝트 관리: GET /admin/projects, PATCH(공개·정렬), DELETE */
export function ProjectsPage() {
  const { navigate } = useRouter()
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [visibility, setVisibility] = useState('')
  const [sort, setSort] = useState('sortOrder')
  const [pageState, setPageState] = useState({ key: '', page: 1 })
  const [reorder, setReorder] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const debounced = useDebouncedValue(search.trim(), 300)
  const q = debounced.length >= 2 ? debounced : ''
  const filterKey = `${q}|${visibility}|${sort}`
  const page = pageState.key === filterKey ? pageState.page : 1

  const list = useApi((signal) => api.admin.projects({ q, visibility, sort, page, limit: PAGE_SIZE }, { signal }), [q, visibility, sort, page])
  // 하단 요약: 공개·비공개 개수는 각각 1건만 조회해 meta.totalItems로 센다
  const counts = useApi(
    (signal) =>
      Promise.all([
        api.admin.projects({ visibility: 'public', limit: 1 }, { signal }),
        api.admin.projects({ visibility: 'private', limit: 1 }, { signal }),
      ]).then(([pub, priv]) => ({ data: { public: pub.meta.totalItems, private: priv.meta.totalItems }, meta: null })),
    [list.meta?.totalItems, list.data?.map((project) => project.visibility).join(',')],
  )

  const projects = list.data ?? []

  const patch = async (project, body, message) => {
    setBusyId(project.id)
    try {
      const { data } = await api.admin.updateProject(project.id, body)
      list.setData((items) => items.map((item) => (item.id === data.id ? data : item)))
      toast({ title: '저장되었습니다', body: message })
      return true
    } catch (error) {
      toast({ tone: 'error', title: '저장하지 못했습니다', body: adminErrorMessage(error) })
      return false
    } finally {
      setBusyId(null)
    }
  }

  /** 위·아래로 옮긴 뒤, 화면 순서대로 sortOrder를 다시 매기고 바뀐 항목만 PATCH */
  const move = async (index, delta) => {
    const target = index + delta
    if (target < 0 || target >= projects.length) return
    const next = [...projects]
    ;[next[index], next[target]] = [next[target], next[index]]
    const offset = (page - 1) * PAGE_SIZE
    const changes = next
      .map((project, position) => ({ project, sortOrder: offset + position + 1 }))
      .filter(({ project, sortOrder }) => project.sortOrder !== sortOrder)
    setBusyId('reorder')
    try {
      for (const { project, sortOrder } of changes) {
        await api.admin.updateProject(project.id, { sortOrder })
      }
      toast({ title: '순서를 저장했습니다', body: `${changes.length}개 항목의 정렬 순서를 변경했습니다.` })
    } catch (error) {
      toast({ tone: 'error', title: '순서를 저장하지 못했습니다', body: adminErrorMessage(error) })
    } finally {
      setBusyId(null)
      list.reload()
    }
  }

  const confirmDelete = async () => {
    await api.admin.deleteProject(deleting.id)
    toast({ title: '삭제되었습니다', body: `${deleting.title} 프로젝트를 삭제했습니다.` })
    setDeleting(null)
    list.reload()
  }

  let body
  if (list.status === 'error') body = <ErrorState error={list.error} onRetry={list.reload} />
  else if (!list.hasLoaded) body = <LoadingState compact />
  else if (!projects.length) {
    body = q || visibility ? (
      <EmptyState icon="search" tone="amber" title="검색 결과가 없습니다" action={<Button variant="amber-outline" size="sm" onClick={() => { setSearch(''); setVisibility('') }}>필터 초기화</Button>} />
    ) : (
      <EmptyState icon="folder-open" title="등록된 프로젝트가 없습니다" body="첫 프로젝트를 등록하면 여기에 표시됩니다." action={<Button variant="lilac-outline" size="sm" to="/admin/projects/new">프로젝트 등록</Button>} />
    )
  } else {
    body = (
      <div className="table-wrap">
        <table className={list.isLoading ? 'admin-table is-stale' : 'admin-table'}>
          <thead>
            <tr>
              <th scope="col" className="col-order">
                <span className="sr-only">순서</span>
              </th>
              <th scope="col">프로젝트</th>
              <th scope="col">상태</th>
              <th scope="col">기술</th>
              <th scope="col">공개</th>
              <th scope="col">수정일</th>
              <th scope="col" className="col-actions">
                <span className="sr-only">관리</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project, index) => (
              <tr key={project.id}>
                <td className="col-order">
                  {reorder ? (
                    <span className="order-buttons">
                      <IconButton icon="chevron-up" label={`${project.title} 위로`} onClick={() => move(index, -1)} disabled={busyId !== null || index === 0} />
                      <IconButton icon="chevron-down" label={`${project.title} 아래로`} onClick={() => move(index, 1)} disabled={busyId !== null || index === projects.length - 1} />
                    </span>
                  ) : (
                    <span className="order-num">
                      <Icon name="grip" size={14} />
                      {project.sortOrder}
                    </span>
                  )}
                </td>
                <td>
                  <div className="cell-title">
                    <img className="cell-thumb" src={project.thumbnailUrl || projectArt(index).src} alt="" />
                    <span>
                      <span className="cell-title__main">{project.title}</span>
                      <span className="cell-title__sub">{project.tags?.length ? formatTags(project.tags) : project.slug}</span>
                    </span>
                  </div>
                </td>
                <td>{project.endedAt ? <Badge tone="lilac">완료</Badge> : <Badge tone="aqua">진행 중</Badge>}</td>
                <td className="cell-muted">{project.skills?.map((skill) => skill.name).join(' · ') || '—'}</td>
                <td>
                  <VisibilityToggle
                    visibility={project.visibility}
                    disabled={busyId !== null}
                    onChange={(next) => patch(project, { visibility: next }, next === 'public' ? `${project.title}을(를) 공개했습니다.` : `${project.title}을(를) 비공개로 바꿨습니다.`)}
                  />
                </td>
                <td className="cell-mono">{formatDate(project.updatedAt)}</td>
                <td className="col-actions">
                  <RowActions onEdit={() => navigate(`/admin/projects/${project.id}`)} onDelete={() => setDeleting(project)} disabled={busyId !== null} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="table-foot">
          <span>
            전체 {list.meta?.totalItems ?? 0}개
            {counts.data ? ` · 공개 ${counts.data.public}개 · 비공개 ${counts.data.private}개` : ''}
          </span>
          <Pagination meta={list.meta} page={page} onPage={(next) => setPageState({ key: filterKey, page: next })} disabled={list.isLoading} />
        </div>
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="프로젝트 관리"
        description="등록·수정·삭제와 공개 여부, 정렬 순서를 관리합니다."
        actions={
          <>
            <Button
              variant={reorder ? 'accent' : 'secondary'}
              iconLeft="arrow-up-down"
              onClick={() => {
                if (!reorder) {
                  setSort('sortOrder')
                  setSearch('')
                  setVisibility('')
                }
                setReorder(!reorder)
              }}
              aria-pressed={reorder}
            >
              {reorder ? '순서 변경 끝내기' : '순서 변경'}
            </Button>
            <Button variant="solid-aqua" iconLeft="plus" to="/admin/projects/new">
              새 프로젝트
            </Button>
          </>
        }
      />
      {reorder ? <p className="notice notice--aqua admin-notice"><Icon name="info" size={16} /><span>화살표로 순서를 바꾸면 화면 순서대로 정렬 순서(sortOrder)를 저장합니다. 공개 사이트의 &apos;추천순&apos;이 이 순서를 따릅니다.</span></p> : null}
      <div className="admin-filter">
        <label className="search-box">
          <Icon name="search" size={17} />
          <span className="sr-only">프로젝트 검색</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="프로젝트 제목·요약·태그 검색 (2자 이상)" disabled={reorder} />
        </label>
        <FilterSelect label="공개 여부" value={visibility} onChange={setVisibility} options={[{ value: '', label: '전체' }, { value: 'public', label: '공개' }, { value: 'private', label: '비공개' }]} />
        <FilterSelect label="정렬" value={sort} onChange={setSort} options={reorder ? SORTS.slice(0, 1) : SORTS} />
      </div>
      <div className="admin-panel">{body}</div>
      <ConfirmDeleteModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="프로젝트를 삭제할까요?"
        name={deleting?.title}
        description="삭제하면 프로젝트의 상세 내용과 학습 기록의 연결이 함께 제거됩니다. 이 작업은 되돌릴 수 없습니다."
        confirmText={deleting?.title}
        onConfirm={confirmDelete}
      />
    </>
  )
}
