import { useCallback, useEffect, useMemo, useState } from 'react'
import { I18nContext, LANGUAGES, readStoredLanguage, STORAGE_KEY, translate } from './context.js'

/** 첫 방문은 한국어, 선택한 언어는 브라우저에 저장해 새로고침 후에도 유지한다. */
export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(readStoredLanguage)

  useEffect(() => {
    document.documentElement.lang = lang
    try {
      window.localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // 저장소를 쓸 수 없는 환경에서는 이번 방문 동안만 유지한다
    }
  }, [lang])

  const setLang = useCallback((next) => {
    if (LANGUAGES.includes(next)) setLangState(next)
  }, [])

  const t = useCallback((key, vars) => translate(lang, key, vars), [lang])

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
