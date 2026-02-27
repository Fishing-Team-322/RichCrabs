import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { routes } from '../../app/router/routeMap'
import { preloadQuizRuntime } from '../../app/router/lazyPages'
import { useNotifications } from '../../app/providers/NotificationProvider'
import { joinApi } from '../../services/joinApi'
import { playerSession } from '../../services/playerSession'
import { AppError } from '../../services/api'
import { validateJoinByInvite, validateJoinByPin, type JoinByInviteFormData, type JoinByPinFormData } from '../../shared/validation/formSchemas'
import { useTranslation } from 'react-i18next'
import '../rooms/rooms.css'

type JoinMethod = 'pin' | 'invite'

const humanizeJoinError = (error: unknown) => {
  if (!(error instanceof AppError)) return 'Не удалось присоединиться к комнате. Попробуйте ещё раз.'
  const code = (error.code || '').toLowerCase()
  const message = error.message.toLowerCase()
  if (code.includes('expired') || message.includes('expired') || message.includes('ист')) return 'Ссылка или токен приглашения истекли. Попросите новый invite у host.'
  if (code.includes('closed') || message.includes('closed') || message.includes('finish')) return 'Комната уже закрыта для входа.'
  if (code.includes('limit') || message.includes('limit') || message.includes('full')) return 'Достигнут лимит игроков в комнате.'
  if (error.status === 400 || error.status === 404) return 'Неверный PIN или invite-token. Проверьте и попробуйте снова.'
  return error.message || 'Не удалось присоединиться к комнате. Попробуйте ещё раз.'
}

const JoinPage = () => {
  const [tab, setTab] = useState<JoinMethod>('pin')
  const [loading, setLoading] = useState(false)
  const [pinForm, setPinForm] = useState<JoinByPinFormData>({ playerName: playerSession.getPlayerName(), pin: '' })
  const [inviteForm, setInviteForm] = useState<JoinByInviteFormData>({ playerName: playerSession.getPlayerName(), inviteToken: '' })
  const [pinErrors, setPinErrors] = useState<Partial<Record<'playerName' | 'pin' | 'root', string>>>({})
  const [inviteErrors, setInviteErrors] = useState<Partial<Record<'playerName' | 'inviteToken' | 'root', string>>>({})
  const navigate = useNavigate()
  const notifications = useNotifications()
  const { t } = useTranslation()

  useEffect(() => {
    void preloadQuizRuntime()
  }, [])

  const onSubmitPin = useCallback(async (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateJoinByPin(pinForm)
    if (Object.keys(nextErrors).length) return setPinErrors(nextErrors)
    setPinErrors({})

    setLoading(true)
    try {
      const response = await joinApi.joinByPin(pinForm.pin.trim(), pinForm.playerName.trim())
      playerSession.saveToken(response.token)
      playerSession.savePlayerName(pinForm.playerName.trim())
      playerSession.savePlayerId(response.playerId)
      notifications.success('Вы успешно подключились к комнате.')
      navigate(routes.quizRuntime.replace(':roomId', response.gameId))
    } catch (joinError: unknown) {
      const message = humanizeJoinError(joinError)
      setPinErrors({ root: message })
      notifications.error(message)
    } finally {
      setLoading(false)
    }
  }, [navigate, notifications, pinForm])

  const onSubmitInvite = useCallback(async (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateJoinByInvite(inviteForm)
    if (Object.keys(nextErrors).length) return setInviteErrors(nextErrors)
    setInviteErrors({})

    setLoading(true)
    try {
      const response = await joinApi.joinByInviteToken(inviteForm.inviteToken.trim(), inviteForm.playerName.trim())
      playerSession.saveToken(response.token)
      playerSession.savePlayerName(inviteForm.playerName.trim())
      playerSession.savePlayerId(response.playerId)
      notifications.success('Вы успешно подключились к комнате.')
      navigate(routes.quizRuntime.replace(':roomId', response.gameId))
    } catch (joinError: unknown) {
      const message = humanizeJoinError(joinError)
      setInviteErrors({ root: message })
      notifications.error(message)
    } finally {
      setLoading(false)
    }
  }, [inviteForm, navigate, notifications])

  return (
    <section className="roomsPage joinPage">
      <article className="pageCard roomForm joinCard">
        <h1>{t('join.title')}</h1>
        <div className="roomsActions">
          <button className={`roomButton ${tab === 'pin' ? 'primary' : ''}`} type="button" onClick={() => setTab('pin')}>{t('join.pinTab')}</button>
          <button className={`roomButton ${tab === 'invite' ? 'primary' : ''}`} type="button" onClick={() => setTab('invite')}>{t('join.inviteTab')}</button>
        </div>

        {tab === 'pin' ? (
          <form className="roomForm" onSubmit={(event) => void onSubmitPin(event)}>
            <label>{t('join.playerName')}
              <input value={pinForm.playerName} onChange={(event) => setPinForm((prev) => ({ ...prev, playerName: event.target.value }))} className={pinErrors.playerName ? 'error' : ''} placeholder="Например: Alice" />
              {pinErrors.playerName && <span className="ui-help">{pinErrors.playerName}</span>}
            </label>
            <label>{t('join.roomPin')}
              <input value={pinForm.pin} onChange={(event) => setPinForm((prev) => ({ ...prev, pin: event.target.value }))} className={pinErrors.pin ? 'error' : ''} placeholder="123456" />
              {pinErrors.pin && <span className="ui-help">{pinErrors.pin}</span>}
            </label>
            {pinErrors.root && <div className="roomError">{pinErrors.root}</div>}
            <button className="roomButton primary" type="submit" disabled={loading}>{loading ? t('join.joining') : t('join.joinButton')}</button>
          </form>
        ) : (
          <form className="roomForm" onSubmit={(event) => void onSubmitInvite(event)}>
            <label>{t('join.playerName')}
              <input value={inviteForm.playerName} onChange={(event) => setInviteForm((prev) => ({ ...prev, playerName: event.target.value }))} className={inviteErrors.playerName ? 'error' : ''} placeholder="Например: Alice" />
              {inviteErrors.playerName && <span className="ui-help">{inviteErrors.playerName}</span>}
            </label>
            <label>{t('join.inviteToken')}
              <input value={inviteForm.inviteToken} onChange={(event) => setInviteForm((prev) => ({ ...prev, inviteToken: event.target.value }))} className={inviteErrors.inviteToken ? 'error' : ''} placeholder="token из ссылки invite" />
              {inviteErrors.inviteToken && <span className="ui-help">{inviteErrors.inviteToken}</span>}
            </label>
            {inviteErrors.root && <div className="roomError">{inviteErrors.root}</div>}
            <button className="roomButton primary" type="submit" disabled={loading}>{loading ? t('join.joining') : t('join.joinButton')}</button>
          </form>
        )}
      </article>
    </section>
  )
}

export default JoinPage
