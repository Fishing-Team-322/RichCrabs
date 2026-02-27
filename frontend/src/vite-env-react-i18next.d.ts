import type { Module } from 'i18next'

declare module 'react-i18next' {
  export const initReactI18next: Module

  export function useTranslation(): {
    t: (key: string, options?: Record<string, unknown>) => any
    i18n: {
      language: string
      changeLanguage: (language: string) => Promise<unknown>
    }
  }
}
