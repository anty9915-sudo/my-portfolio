import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import { useToast } from '../common/toastContext.js'
import { adminErrorMessage, fieldErrorsFrom } from './adminContext.js'

/**
 * 관리자 등록·수정 폼 공통 흐름.
 * - 서버 문서(record)에서 폼 값(initial)을 만들고, 입력한 값은 record가 바뀔 때까지 draft로 둔다.
 * - 저장: 새 항목은 POST(전체), 기존 항목은 PATCH(바뀐 필드만). 성공 응답을 받은 뒤에만 알림을 띄운다.
 *
 * @param {{
 *   id?: string,
 *   load: (id: string, signal: AbortSignal) => Promise<{ data: object }>,
 *   create: (body: object) => Promise<{ data: object }>,
 *   update: (id: string, body: object) => Promise<{ data: object }>,
 *   toForm: (record: object | null) => object,
 *   toPayload: (form: object) => object,
 *   validate?: (form: object) => Record<string, string>,
 *   onCreated?: (record: object) => void,
 *   label: string,
 * }} options
 */
export function useResourceForm({ id, load, create, update, toForm, toPayload, validate, onCreated, label }) {
  const { toast } = useToast()
  const query = useApi((signal) => (id ? load(id, signal) : Promise.resolve({ data: null, meta: null })), [id ?? 'new'])
  const record = query.data
  const sourceKey = id ? (record ? `${record.id}:${record.updatedAt}` : null) : 'new'
  const initial = useMemo(() => toForm(record), [record, toForm])
  const [draft, setDraft] = useState({ sourceKey: null, values: null })
  const [errors, setErrors] = useState({})
  const [saveState, setSaveState] = useState({ status: 'idle', message: '' })

  const form = draft.sourceKey === sourceKey && draft.values ? draft.values : initial
  const dirty = JSON.stringify(toPayload(form)) !== JSON.stringify(toPayload(initial))

  const setField = useCallback(
    (field, value) => {
      setDraft((previous) => {
        const base = previous.sourceKey === sourceKey && previous.values ? previous.values : initial
        return { sourceKey, values: { ...base, [field]: value } }
      })
      setErrors((previous) => (previous[field] ? { ...previous, [field]: undefined } : previous))
    },
    [sourceKey, initial],
  )

  // 저장하지 않은 변경사항이 있으면 창을 닫기 전에 브라우저가 확인한다
  useEffect(() => {
    if (!dirty) return undefined
    const onBeforeUnload = (event) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const save = async () => {
    const clientErrors = validate?.(form) ?? {}
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length) {
      setSaveState({ status: 'error', message: '입력 값을 확인해 주세요.' })
      return
    }
    const payload = toPayload(form)
    setSaveState({ status: 'saving', message: '' })
    try {
      if (!id) {
        const { data } = await create(payload)
        setSaveState({ status: 'idle', message: '' })
        toast({ title: '저장되었습니다', body: `${label}을(를) 등록했습니다.` })
        onCreated?.(data)
        return
      }
      const before = toPayload(initial)
      const changes = Object.fromEntries(Object.entries(payload).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(before[key])))
      if (!Object.keys(changes).length) {
        setSaveState({ status: 'idle', message: '' })
        return
      }
      const { data } = await update(id, changes)
      query.setData(data)
      setSaveState({ status: 'saved', message: '' })
      toast({ title: '저장되었습니다', body: '서버 응답을 확인한 뒤 반영했습니다.' })
    } catch (error) {
      setErrors(fieldErrorsFrom(error))
      setSaveState({ status: 'error', message: adminErrorMessage(error) })
    }
  }

  return { query, record, form, setField, errors, dirty, save, saveState, saving: saveState.status === 'saving' }
}

/** 'a, b ,c' → ['a', 'b', 'c'] (태그 입력) */
export function parseTags(text) {
  return [
    ...new Set(
      text
        .split(/[,\n]/)
        .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, '-'))
        .filter(Boolean),
    ),
  ]
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const emptyToNull = (value) => (typeof value === 'string' && value.trim() === '' ? null : typeof value === 'string' ? value.trim() : value)
