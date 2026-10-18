import { createContext, useContext } from 'react'
import en from './en.json'
import ko from './ko.json'

export const LANGUAGES = ['ko', 'en']
export const DEFAULT_LANGUAGE = 'ko'
export const STORAGE_KEY = 'portfolio.lang'
export const dictionaries = { ko, en }

export const I18nContext = createContext(null)

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used inside I18nProvider')
  return context
}

function lookup(dictionary, key) {
  return key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), dictionary)
}

/** 선택한 언어 → 한국어 순으로 찾고, 없으면 키를 그대로 보여 준다 (누락을 화면에서 발견). */
export function translate(lang, key, vars) {
  const value = lookup(dictionaries[lang], key) ?? lookup(dictionaries[DEFAULT_LANGUAGE], key) ?? key
  if (typeof value !== 'string' || !vars) return value
  return value.replace(/\{(\w+)\}/g, (match, name) => (vars[name] === undefined ? match : String(vars[name])))
}

export function readStoredLanguage() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return LANGUAGES.includes(stored) ? stored : DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
}
