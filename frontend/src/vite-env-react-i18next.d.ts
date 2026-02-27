declare module 'react-i18next' {
  export const initReactI18next: unknown

  export function useTranslation(): {
    t: (key: string, options?: Record<string, unknown>) => any
    i18n: {
      language: string
      changeLanguage: (language: string) => Promise<unknown>
    }
  }
}
