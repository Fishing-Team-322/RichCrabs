import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { routes } from '../../app/router/routeMap'
import { botsApi } from '../../services/botsApi'
import { roomsApi } from '../../services/roomsApi'
import { Modal } from '../../components/ui'
import { useNotifications } from '../../app/providers/NotificationProvider'
import useAuth from '../../hooks/useAuth'
import { validateBotToken } from '../../shared/validation/formSchemas'
import type { RoomDetailsDto, RoomInviteDto } from '../../types/room.types'
import './rooms.css'

const RoomDetails = () => {
  const { roomId = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { profile } = useAuth()
  const notifications = useNotifications()

  const [room, setRoom] = useState<RoomDetailsDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingAction, setPendingAction] = useState(false)
  const [error, setError] = useState('')
  const [invite, setInvite] = useState<RoomInviteDto | null>(null)

  const [botOfferOpen, setBotOfferOpen] = useState(false)
  const [botStep, setBotStep] = useState<'offer' | 'token'>('offer')
  const [botToken, setBotToken] = useState('')
  const [botTokenError, setBotTokenError] = useState('')
  const [botSaving, setBotSaving] = useState(false)

  const botOfferKey = `room:${roomId}:botOffer`
  const isPaidPlan = profile?.subscription === 'premium' || profile?.subscription === 'pro'

  useEffect(() => {
    if (!roomId) return

    const unsubscribe = roomsApi.subscribeRoomDetails(roomId, (nextRoom) => {
      setRoom(nextRoom)
      setLoading(false)
    })

    return unsubscribe
  }, [roomId])

  useEffect(() => {
    if (!roomId) return
    roomsApi.regenerateInvite(roomId).then(setInvite).catch(() => undefined)
  }, [roomId])

  useEffect(() => {
    const shouldOffer = (location.state && typeof location.state === 'object' && 'createdRoom' in location.state) || searchParams.get('botOffer') === '1'
    if (!roomId || !shouldOffer) return

    if (sessionStorage.getItem(botOfferKey)) return
    setBotOfferOpen(true)
    sessionStorage.setItem(botOfferKey, 'shown')
  }, [botOfferKey, location.state, roomId, searchParams])

  const inviteLink = useMemo(() => {
    const path = invite?.invitePath ?? room?.inviteLink
    if (!path) return ''
    if (/^https?:\/\//.test(path)) return path
    return `${window.location.origin}${path}`
  }, [invite, room])

  const qrCodeUrl = useMemo(() => {
    if (!invite?.inviteQrSvg) return ''
    return `data:image/svg+xml;utf8,${encodeURIComponent(invite.inviteQrSvg)}`
  }, [invite])

  const closeBotOffer = (markSkip = false) => {
    if (markSkip) {
      sessionStorage.setItem(botOfferKey, 'skip')
    }
    setBotOfferOpen(false)
    setBotStep('offer')
    setBotToken('')
    setBotTokenError('')
  }

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      notifications.success('Скопировано в буфер обмена.')
      setError('')
    } catch {
      setError('Не удалось скопировать в буфер обмена.')
    }
  }

  const onValidateToken = async () => {
    const nextErrors = validateBotToken({ token: botToken })
    if (nextErrors.token) {
      setBotTokenError(nextErrors.token)
      return
    }
    setBotTokenError('')

    try {
      setBotSaving(true)
      await botsApi.validate({ token: botToken.trim() })
      notifications.success('Токен Telegram-бота успешно проверен.')
    } catch (apiError: unknown) {
      const message = apiError instanceof Error ? apiError.message : 'Не удалось проверить токен.'
      setBotTokenError(message)
      notifications.error(message)
    } finally {
      setBotSaving(false)
    }
  }

  const onBindBot = async () => {
    const nextErrors = validateBotToken({ token: botToken })
    if (nextErrors.token) {
      setBotTokenError(nextErrors.token)
      return
    }
    setBotTokenError('')

    try {
      setBotSaving(true)
      await botsApi.bind({ token: botToken.trim() })
      notifications.success('Telegram-бот подключен к вашему аккаунту.')
      closeBotOffer()
    } catch (apiError: unknown) {
      const message = apiError instanceof Error ? apiError.message : 'Не удалось подключить Telegram-бота.'
      setBotTokenError(message)
      notifications.error(message)
    } finally {
      setBotSaving(false)
    }
  }

  const runAction = async (action: 'start' | 'pause' | 'finish') => {
    if (!roomId) return

    setPendingAction(true)
    setError('')

    try {
      if (action === 'start') {
        const updated = await roomsApi.open(roomId)
        setRoom(updated)
        notifications.success('Игра началась')
      }
      if (action === 'pause') {
        const updated = await roomsApi.pause(roomId)
        setRoom(updated)
      }
      if (action === 'finish') {
        await roomsApi.close(roomId)
        const updated = await roomsApi.details(roomId)
        setRoom(updated)
      }
    } catch (apiError: unknown) {
      setError(apiError instanceof Error ? apiError.message : 'Действие host завершилось ошибкой.')
    } finally {
      setPendingAction(false)
    }
  }

  return (
    <section className="roomsPage">
      <div className="pageCard roomsHeader">
        <div>
          <h1>Карточка комнаты</h1>
          <p>Автоподписка на обновления статуса комнаты включена.</p>
        </div>
        <Link className="roomLink" to={routes.rooms}>
          К списку комнат
        </Link>
      </div>

      {error && <div className="roomError">{error}</div>}

      {!room ? (
        <div className="pageCard">{loading ? 'Загрузка карточки...' : 'Комната не найдена.'}</div>
      ) : (
        <article className="pageCard roomForm">
          <div className="roomInfoRow">
            <strong>{room.quizTitle}</strong>
            <span className={`roomStatus ${room.status}`}>{room.status}</span>
          </div>

          <div className="roomMeta">
            Игроки: {room.playersCount}/{room.playerLimit} · Приватность: {room.settings.privacy}
          </div>

          <section className="pageCard roomInviteSection">
            <h2>Пригласить игроков</h2>
            <p className="roomMeta">Отправьте ссылку или QR игрокам, либо продиктуйте PIN.</p>
            <div className="roomInfoRow">
              <strong>PIN:</strong> <code>{room.pin}</code>
              <button className="roomButton" onClick={() => void copyText(room.pin)}>
                Копировать PIN
              </button>
            </div>

            <div className="roomInfoRow">
              <strong>Invite-link:</strong>
              <a href={inviteLink}>{inviteLink}</a>
              <button className="roomButton" onClick={() => void copyText(inviteLink)}>
                Копировать ссылку
              </button>
              <button className="roomButton" onClick={() => roomId && void roomsApi.regenerateInvite(roomId).then(setInvite).catch(() => setError('Не удалось обновить приглашение.'))}>
                Обновить приглашение
              </button>
            </div>

            {qrCodeUrl && (
              <div className="roomQr">
                <img src={qrCodeUrl} width={168} height={168} alt="QR invite-link" />
                <span className="roomMeta">QR для быстрого входа по invite-link</span>
              </div>
            )}
          </section>

          <div className="roomMeta">
            Таймеры: lobby {room.settings.timers.lobbyTimerSec}s · question {room.settings.timers.questionTimerSec}s · reveal{' '}
            {room.settings.timers.answerRevealSec}s
          </div>

          {room.isHost && (
            <div className="roomsActions">
              <button className="roomButton primary" disabled={pendingAction} onClick={() => void runAction('start')}>
                Начать игру
              </button>
              <button className="roomButton" disabled={pendingAction} onClick={() => void runAction('pause')}>
                Пауза
              </button>
              <button className="roomButton" disabled={pendingAction} onClick={() => void runAction('finish')}>
                Завершить
              </button>
            </div>
          )}
        </article>
      )}

      <Modal open={botOfferOpen} title="Хотите подключить Telegram-бота для этой игры?" onClose={() => closeBotOffer(true)}>
        {botStep === 'offer' ? (
          <div className="roomForm">
            {!isPaidPlan && <p className="roomMeta">Доступно в платной подписке.</p>}
            {!isPaidPlan ? (
              <div className="roomsActions">
                <button className="roomButton primary" type="button" onClick={() => navigate(routes.subscriptions)}>
                  Перейти к подпискам
                </button>
                <button className="roomButton" type="button" onClick={() => closeBotOffer(true)}>
                  Пропустить
                </button>
              </div>
            ) : (
              <div className="roomsActions">
                <button className="roomButton primary" type="button" onClick={() => setBotStep('token')}>
                  Подключить
                </button>
                <button className="roomButton" type="button" onClick={() => closeBotOffer(true)}>
                  Не сейчас
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="roomForm">
            <label>
              Bot token
              <input
                type="password"
                value={botToken}
                onChange={(event) => setBotToken(event.target.value)}
                placeholder="123456789:AA..."
              />
            </label>
            {botTokenError && <div className="roomError">{botTokenError}</div>}
            <div className="roomsActions">
              <button className="roomButton" type="button" disabled={botSaving} onClick={() => void onValidateToken()}>
                Проверить токен
              </button>
              <button className="roomButton primary" type="button" disabled={botSaving} onClick={() => void onBindBot()}>
                Сохранить
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  )
}

export default RoomDetails
