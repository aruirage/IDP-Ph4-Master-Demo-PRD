import { createI18n } from 'vue-i18n'
import ja from './locales/ja'
import zhCN from './locales/zh-CN'

export type AppLocale = 'ja' | 'zh-CN'

const LOCALE_STORAGE_KEY = 'neosai-prototype-locale'

function readStoredLocale(): AppLocale {
  const requestedLocale = new URLSearchParams(window.location.search).get('lang')
  if (requestedLocale === 'zh' || requestedLocale === 'zh-CN') return 'zh-CN'
  if (requestedLocale === 'ja') return 'ja'
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
  if (stored === 'ja' || stored === 'zh-CN') return stored
  return 'ja'
}

export const i18n = createI18n({
  legacy: false,
  locale: readStoredLocale(),
  fallbackLocale: 'ja',
  messages: {
    ja,
    'zh-CN': zhCN
  }
})

export function persistLocale(locale: AppLocale) {
  localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  document.documentElement.lang = locale
  document.title = locale === 'zh-CN' ? 'NeosAI IDP 原型' : 'NeosAI IDP プロトタイプ'
}

persistLocale(i18n.global.locale.value as AppLocale)
