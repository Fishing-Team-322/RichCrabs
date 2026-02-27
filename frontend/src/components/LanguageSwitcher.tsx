import { useTranslation } from 'react-i18next'

const LanguageSwitcher = () => {
  const { i18n, t } = useTranslation()

  return (
    <label className="languageSwitcher">
      <span>{t('common.language')}</span>
      <select value={i18n.language.startsWith('ru') ? 'ru' : 'en'} onChange={(event) => void i18n.changeLanguage(event.target.value)}>
        <option value="ru">RU</option>
        <option value="en">EN</option>
      </select>
    </label>
  )
}

export default LanguageSwitcher
