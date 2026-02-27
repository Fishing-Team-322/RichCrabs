import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../../locales/en/common'
import ru from '../../locales/ru/common'

export type SupportedLanguage = 'ru' | 'en'

const STORAGE_KEY = 'richcrabs_language'

const getInitialLanguage = (): SupportedLanguage => {
  const fromStorage = localStorage.getItem(STORAGE_KEY)
  if (fromStorage === 'ru' || fromStorage === 'en') return fromStorage

  const fromBrowser = navigator.language.toLowerCase()
  return fromBrowser.startsWith('ru') ? 'ru' : 'en'
}

const initialLanguage = getInitialLanguage()

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      ru: { translation: ru },
      en: { translation: en },
    },
    lng: initialLanguage,
    fallbackLng: 'ru',
    interpolation: {
      escapeValue: false,
    },
  })

document.documentElement.lang = initialLanguage

i18n.on('languageChanged', (nextLanguage) => {
  localStorage.setItem(STORAGE_KEY, nextLanguage)
  document.documentElement.lang = nextLanguage
})

export default i18n
