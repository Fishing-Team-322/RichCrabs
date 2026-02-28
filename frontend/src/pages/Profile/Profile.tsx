import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { routes } from '../../app/router/routeMap'
import { profileApi } from '../../services/profileApi'
import { useAppDispatch } from '../../store/hooks'
import { setProfile } from '../../store/slices'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import type { SessionDto, UserDto } from '../../types/auth.types'
import './profile.css'

const planLabel = (plan?: string) => {
  if (!plan) return 'Не указан'
  if (plan === 'basic') return 'Basic'
  if (plan === 'premium') return 'Premium'
  if (plan === 'pro') return 'Pro'
  return plan
}

const Profile = () => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const [profile, setLocalProfile] = useState<UserDto | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [timezone, setTimezone] = useState('')
  const [locale, setLocale] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [securityMessage, setSecurityMessage] = useState<string | null>(null)

  const [sessions, setSessions] = useState<SessionDto[]>([])
  const [sessionsSupported, setSessionsSupported] = useState(true)
  const [sessionsLoading, setSessionsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const data = await profileApi.getProfile()
        setLocalProfile(data)
        setName(data.displayName || '')
        setAvatarUrl(data.avatarUrl || '')
        setTimezone(data.timezone || '')
        setLocale(data.locale || '')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Не удалось загрузить профиль'
        setError(message)
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [])

  useEffect(() => {
    const loadSessions = async () => {
      setSessionsLoading(true)
      try {
        const list = await profileApi.getSessions()
        setSessions(Array.isArray(list) ? list : [])
      } catch (err) {
        const status404 = err instanceof Error && err.message.includes('404')
        if (status404) {
          setSessionsSupported(false)
        }
      } finally {
        setSessionsLoading(false)
      }
    }

    void loadSessions()
  }, [])

  const winRate = useMemo(() => {
    if (!profile?.gamesPlayed) return '0%'
    return `${Math.round((profile.wins / profile.gamesPlayed) * 100)}%`
  }, [profile])

  const onSaveProfile = async (event: FormEvent) => {
    event.preventDefault()
    setSaveState('saving')
    try {
      const updated = await profileApi.updateProfile({
        displayName: name.trim(),
        avatarUrl: avatarUrl.trim() || undefined,
        timezone: timezone.trim() || undefined,
        locale: locale.trim() || undefined,
      })
      setLocalProfile(updated)
      dispatch(setProfile(updated))
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  const onPasswordChange = async (event: FormEvent) => {
    event.preventDefault()
    setSecurityMessage(null)

    if (newPassword.length < 6) {
      setSecurityMessage('Новый пароль должен содержать минимум 6 символов.')
      return
    }

    try {
      await profileApi.changePassword({ currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setSecurityMessage('Пароль обновлен.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось сменить пароль.'
      setSecurityMessage(message)
    }
  }

  if (isLoading) {
    return <section className="pageCard">{t('profile.loading')}</section>
  }

  if (error || !profile) {
    return <section className="pageCard">{error || t('profile.notFound')}</section>
  }

  return (
    <section className="profilePage">
      <div className="profileGrid">
        <article className="pageCard">
          <h1>{t('profile.title')}</h1>
          <LanguageSwitcher />
          <div className="profileBasic">
            {profile.avatarUrl ? <img src={profile.avatarUrl} alt={profile.displayName} className="profileAvatar" /> : <div className="profileAvatar fallback">{profile.displayName[0]}</div>}
            <div>
              <div className="profileName">{profile.displayName}</div>
              <div>{profile.email}</div>
              <div className="profileMuted">ID: {profile.id}</div>
            </div>
          </div>
        </article>

        <article className="pageCard">
          <h2>Статистика игр и квизов</h2>
          <div className="statsGrid">
            <div>
              <div className="statsLabel">Сыграно игр</div>
              <div className="statsValue">{profile.gamesPlayed}</div>
            </div>
            <div>
              <div className="statsLabel">Побед</div>
              <div className="statsValue">{profile.wins}</div>
            </div>
            <div>
              <div className="statsLabel">Win rate</div>
              <div className="statsValue">{winRate}</div>
            </div>
            <div>
              <div className="statsLabel">Квизов пройдено</div>
              <div className="statsValue">{profile.quizzesPlayed ?? '—'}</div>
            </div>
          </div>
        </article>


        <article className="pageCard">
          <h2>Быстрый старт</h2>
          <div className="profileQuickActions">
            <Link to={routes.rooms} className="accountAction">Открытые игры</Link>
            <Link to={routes.roomsNew} className="accountAction">Создать игру</Link>
            <Link to={routes.quizzesNew} className="accountAction">Создать квиз</Link>
            <Link to={routes.bots} className="accountAction">Telegram-боты</Link>
          </div>
        </article>

        <article className="pageCard profileMetaCards">
          <div>
            <h2>Текущий тариф</h2>
            <div className="profileBadge">{planLabel(profile.subscription)}</div>
          </div>
          <div>
            <h2>Telegram-бот</h2>
            <div className={profile.telegramBotConnected ? 'statusOk' : 'statusMuted'}>
              {profile.telegramBotConnected ? `Подключен${profile.telegramBotUsername ? `: @${profile.telegramBotUsername}` : ''}` : 'Не подключен'}
            </div>
          </div>
        </article>

        <article className="pageCard">
          <h2>Редактирование профиля</h2>
          <form className="profileForm" onSubmit={onSaveProfile}>
            <label>
              Имя
              <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
            </label>
            <label>
              Аватар (URL)
              <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." />
            </label>
            <label>
              Timezone
              <input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Europe/Moscow" />
            </label>
            <label>
              Locale
              <input value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="ru-RU" />
            </label>
            <button type="submit" disabled={saveState === 'saving'}>
              {saveState === 'saving' ? 'Сохраняем...' : 'Сохранить профиль'}
            </button>
          </form>
          {saveState === 'saved' && <div className="statusOk">Данные профиля обновлены.</div>}
          {saveState === 'error' && <div className="statusError">Не удалось сохранить профиль.</div>}
        </article>

        <article className="pageCard">
          <h2>Безопасность</h2>
          <form className="profileForm" onSubmit={onPasswordChange}>
            <label>
              Текущий пароль
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            </label>
            <label>
              Новый пароль
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} />
            </label>
            <button type="submit">Сменить пароль</button>
          </form>
          {securityMessage && <div className="profileMuted">{securityMessage}</div>}

          <h3>Активные сессии</h3>
          {sessionsLoading && <div className="profileMuted">Загружаем список сессий...</div>}
          {!sessionsLoading && !sessionsSupported && <div className="profileMuted">API активных сессий пока не поддерживается.</div>}
          {!sessionsLoading && sessionsSupported && sessions.length === 0 && <div className="profileMuted">Активных сессий нет.</div>}
          {!sessionsLoading && sessionsSupported && sessions.length > 0 && (
            <ul className="sessionsList">
              {sessions.map((session) => (
                <li key={session.id}>
                  <strong>{session.current ? 'Текущая сессия' : session.id}</strong>
                  <span>{session.ip || 'IP неизвестен'}</span>
                  <span>{session.lastSeenAt || session.createdAt || 'Нет времени активности'}</span>
                  <span>{session.userAgent || 'Unknown client'}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </section>
  )
}

export default Profile
