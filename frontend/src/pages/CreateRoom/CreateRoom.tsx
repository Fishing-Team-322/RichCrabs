import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { routes } from '../../app/router/routeMap'
import { Skeleton } from '../../components/ui'
import { useNotifications } from '../../app/providers/NotificationProvider'
import { quizApi } from '../../services/quizApi'
import { roomsApi } from '../../services/roomsApi'
import { billingApi } from '../../services/billingApi'
import { botsApi } from '../../services/botsApi'
import useAuth from '../../hooks/useAuth'
import { validateCreateRoom, type CreateRoomFormData } from '../../shared/validation/formSchemas'
import type { QuizListItemDto } from '../../types/quiz.types'
import type { CreateRoomRequestDto, RoomDetailsDto, RoomVisibility } from '../../types/room.types'
import '../rooms/rooms.css'

const CreateRoom = () => {
  const { profile } = useAuth()
  const notifications = useNotifications()
  const [quizzes, setQuizzes] = useState<QuizListItemDto[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [createdRoom, setCreatedRoom] = useState<RoomDetailsDto | null>(null)
  const [showBotOffer, setShowBotOffer] = useState(false)
  const [isPaidPlan, setIsPaidPlan] = useState(false)
  const [botToken, setBotToken] = useState('')
  const [botConnecting, setBotConnecting] = useState(false)
  const [botResult, setBotResult] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'quizId' | 'playerLimit' | 'lobbyTimerSec' | 'questionTimerSec' | 'answerRevealSec', string>>>({})
  const [form, setForm] = useState<CreateRoomFormData>({
    quizId: '',
    playerLimit: 20,
    privacy: 'private',
    lobbyTimerSec: 45,
    questionTimerSec: 30,
    answerRevealSec: 10,
  })

  useEffect(() => {
    let active = true
    setLoading(true)
    void Promise.all([quizApi.list({ status: 'published' }), billingApi.current()])
      .then(([items, subscription]) => {
        if (!active) return
        setQuizzes(items)
        if (items[0]) setForm((prev) => ({ ...prev, quizId: items[0].id }))
        setIsPaidPlan(subscription.planCode !== 'free' && subscription.status === 'active')
      })
      .catch((apiError: unknown) => {
        if (!active) return
        const message = apiError instanceof Error ? apiError.message : 'Не удалось подготовить данные для создания комнаты.'
        setError(message)
        notifications.error(message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [notifications])

  const inviteLink = useMemo(() => {
    if (!createdRoom?.inviteLink) return ''
    if (/^https?:\/\//.test(createdRoom.inviteLink)) return createdRoom.inviteLink
    return `${window.location.origin}${createdRoom.inviteLink}`
  }, [createdRoom])

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      notifications.success('Скопировано в буфер обмена.')
    } catch {
      const message = 'Не удалось скопировать в буфер обмена.'
      setError(message)
      notifications.error(message)
    }
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateCreateRoom(form)
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors)
      return
    }

    setFieldErrors({})
    setSaving(true)
    setError('')
    try {
      if (!profile?.id) {
        throw new Error('Сессия хоста не найдена. Войдите заново.')
      }

      const payload: CreateRoomRequestDto = {
        ownerUserId: profile.id,
        quizId: form.quizId,
        settings: {
          playerLimit: form.playerLimit,
          privacy: form.privacy as RoomVisibility,
          timers: {
            lobbyTimerSec: form.lobbyTimerSec,
            questionTimerSec: form.questionTimerSec,
            answerRevealSec: form.answerRevealSec,
          },
        },
      }
      const room = await roomsApi.create(payload)
      setCreatedRoom(room)
      setShowBotOffer(true)
      notifications.success('Комната успешно создана.')
    } catch (apiError: unknown) {
      const message = apiError instanceof Error ? apiError.message : 'Не удалось создать комнату.'
      setError(message)
      notifications.error(message)
    } finally {
      setSaving(false)
    }
  }

  const connectBot = async () => {
    if (!botToken.trim()) {
      setBotResult('Введите токен Telegram-бота.')
      return
    }
    setBotConnecting(true)
    setBotResult('')
    try {
      const result = await botsApi.bind({ token: botToken.trim() })
      setBotResult(`Бот подключен: @${result.username ?? result.botId}`)
      notifications.success('Telegram-бот подключен к аккаунту.')
    } catch (apiError: unknown) {
      const message = apiError instanceof Error ? apiError.message : 'Не удалось подключить Telegram-бота.'
      setBotResult(message)
      notifications.error(message)
    } finally {
      setBotConnecting(false)
    }
  }

  return (
    <section className="roomsPage roomsPageCompact createRoomPage">
      <div className="pageCard roomsHeader createRoomHeader"><div><h1>Создание комнаты</h1><p>Создайте/опубликуйте квиз, затем настройте игру и приглашения.</p></div><Link className="roomLink" to={routes.rooms}>К списку комнат</Link></div>
      {error && <div className="roomError">{error}</div>}
      <form className="pageCard roomForm" onSubmit={(event) => void onSubmit(event)}>
        {loading ? <><Skeleton height={42} /><Skeleton height={42} /><Skeleton height={42} /></> : <>
          <label>Квиз
            <select value={form.quizId} disabled={quizzes.length === 0} className={fieldErrors.quizId ? 'error' : ''} onChange={(event) => setForm((prev) => ({ ...prev, quizId: event.target.value }))}>
              {quizzes.length === 0 ? <option value="">Нет опубликованных квизов</option> : quizzes.map((quiz) => <option key={quiz.id} value={quiz.id}>{quiz.title} · {quiz.questionsCount} вопросов</option>)}
            </select>
            {fieldErrors.quizId && <span className="ui-help">{fieldErrors.quizId}</span>}
          </label>
          {quizzes.length === 0 && <div className="roomMeta">Сначала создайте квиз: <Link to={routes.quizzesNew}>перейти к созданию квиза</Link></div>}
          <label>Лимит игроков
            <input type="number" value={form.playerLimit} className={fieldErrors.playerLimit ? 'error' : ''} onChange={(event) => setForm((prev) => ({ ...prev, playerLimit: Number(event.target.value) || 0 }))} />
            {fieldErrors.playerLimit && <span className="ui-help">{fieldErrors.playerLimit}</span>}
          </label>
          <label>Приватность
            <select value={form.privacy} onChange={(event) => setForm((prev) => ({ ...prev, privacy: event.target.value as CreateRoomFormData['privacy'] }))}>
              <option value="private">Приватная (по PIN/invite)</option><option value="public">Публичная (видна в open games)</option>
            </select>
          </label>
          <div className="roomsGrid createRoomTimers">
            <label>Таймер лобби (сек)
              <input type="number" value={form.lobbyTimerSec} className={fieldErrors.lobbyTimerSec ? 'error' : ''} onChange={(event) => setForm((prev) => ({ ...prev, lobbyTimerSec: Number(event.target.value) || 0 }))} />
              {fieldErrors.lobbyTimerSec && <span className="ui-help">{fieldErrors.lobbyTimerSec}</span>}
            </label>
            <label>Таймер вопроса (сек)
              <input type="number" value={form.questionTimerSec} className={fieldErrors.questionTimerSec ? 'error' : ''} onChange={(event) => setForm((prev) => ({ ...prev, questionTimerSec: Number(event.target.value) || 0 }))} />
              {fieldErrors.questionTimerSec && <span className="ui-help">{fieldErrors.questionTimerSec}</span>}
            </label>
            <label>Пауза перед ответом (сек)
              <input type="number" value={form.answerRevealSec} className={fieldErrors.answerRevealSec ? 'error' : ''} onChange={(event) => setForm((prev) => ({ ...prev, answerRevealSec: Number(event.target.value) || 0 }))} />
              {fieldErrors.answerRevealSec && <span className="ui-help">{fieldErrors.answerRevealSec}</span>}
            </label>
          </div>
        </>}
        <button className="roomButton primary" disabled={saving || quizzes.length === 0 || loading}>{saving ? 'Создание...' : 'Создать комнату'}</button>
      </form>
      {createdRoom && (
        <article className="pageCard roomForm"><h2>Комната создана</h2>
          <div className="roomInfoRow"><strong>PIN:</strong> <code>{createdRoom.pin}</code><button className="roomButton" type="button" onClick={() => void copyText(createdRoom.pin)}>Копировать PIN</button></div>
          <div className="roomInfoRow"><strong>Ссылка-приглашение:</strong><a href={inviteLink}>{inviteLink}</a><button className="roomButton" type="button" onClick={() => void copyText(inviteLink)}>Копировать ссылку</button></div>

          {showBotOffer && (
            <div className="roomMeta">
              <strong>Развернуть Telegram-бота для этой игры?</strong>
              {isPaidPlan ? (
                <>
                  <div>Функция доступна в платной подписке. Введите токен бота или пропустите шаг.</div>
                  <input type="text" value={botToken} onChange={(event) => setBotToken(event.target.value)} placeholder="123456789:AA..." />
                  <div className="roomsActions">
                    <button type="button" className="roomButton" onClick={() => setShowBotOffer(false)}>Пропустить</button>
                    <button type="button" className="roomButton primary" disabled={botConnecting} onClick={() => void connectBot()}>{botConnecting ? 'Подключаем...' : 'Подключить бота'}</button>
                  </div>
                  {botResult && <div>{botResult}</div>}
                </>
              ) : (
                <div>Для подключения Telegram-бота оформите <Link to={routes.subscriptions}>платную подписку</Link>. Можно продолжить без этого шага.</div>
              )}
            </div>
          )}

          <Link className="roomButton primary" to={routes.roomDetails.replace(':roomId', createdRoom.id)}>Перейти в комнату</Link>
        </article>
      )}
    </section>
  )
}

export default CreateRoom
