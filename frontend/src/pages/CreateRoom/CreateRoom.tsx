import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { routes } from '../../app/router/routeMap'
import { Skeleton } from '../../components/ui'
import { useNotifications } from '../../app/providers/NotificationProvider'
import { quizApi } from '../../services/quizApi'
import { roomsApi } from '../../services/roomsApi'
import { validateCreateRoom, type CreateRoomFormData } from '../../shared/validation/formSchemas'
import type { QuizListItemDto } from '../../types/quiz.types'
import type { CreateRoomRequestDto, RoomDetailsDto, RoomVisibility } from '../../types/room.types'
import '../rooms/rooms.css'

const CreateRoom = () => {
  const notifications = useNotifications()
  const [quizzes, setQuizzes] = useState<QuizListItemDto[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [createdRoom, setCreatedRoom] = useState<RoomDetailsDto | null>(null)
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
    void quizApi.list({ status: 'published' })
      .then((items) => {
        if (!active) return
        setQuizzes(items)
        if (items[0]) setForm((prev) => ({ ...prev, quizId: items[0].id }))
      })
      .catch((apiError: unknown) => {
        if (!active) return
        const message = apiError instanceof Error ? apiError.message : 'Не удалось получить опубликованные квизы.'
        setError(message)
        notifications.error(message)
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
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
      const payload: CreateRoomRequestDto = {
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
      notifications.success('Комната успешно создана.')
    } catch (apiError: unknown) {
      const message = apiError instanceof Error ? apiError.message : 'Не удалось создать комнату.'
      setError(message)
      notifications.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="roomsPage">
      <div className="pageCard roomsHeader"><div><h1>Создание комнаты</h1><p>Выберите опубликованный квиз и задайте правила комнаты.</p></div><Link className="roomLink" to={routes.rooms}>К списку комнат</Link></div>
      {error && <div className="roomError">{error}</div>}
      <form className="pageCard roomForm" onSubmit={(event) => void onSubmit(event)}>
        {loading ? <><Skeleton height={42} /><Skeleton height={42} /><Skeleton height={42} /></> : <>
          <label>Квиз
            <select value={form.quizId} disabled={quizzes.length === 0} className={fieldErrors.quizId ? 'error' : ''} onChange={(event) => setForm((prev) => ({ ...prev, quizId: event.target.value }))}>
              {quizzes.length === 0 ? <option value="">Нет опубликованных квизов</option> : quizzes.map((quiz) => <option key={quiz.id} value={quiz.id}>{quiz.title} · {quiz.questionsCount} вопросов</option>)}
            </select>
            {fieldErrors.quizId && <span className="ui-help">{fieldErrors.quizId}</span>}
          </label>
          <label>Лимит игроков
            <input type="number" value={form.playerLimit} className={fieldErrors.playerLimit ? 'error' : ''} onChange={(event) => setForm((prev) => ({ ...prev, playerLimit: Number(event.target.value) || 0 }))} />
            {fieldErrors.playerLimit && <span className="ui-help">{fieldErrors.playerLimit}</span>}
          </label>
          <label>Приватность
            <select value={form.privacy} onChange={(event) => setForm((prev) => ({ ...prev, privacy: event.target.value as CreateRoomFormData['privacy'] }))}>
              <option value="private">Приватная (по PIN/invite)</option><option value="public">Публичная (видна в open games)</option>
            </select>
          </label>
          <div className="roomsGrid">
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
          <div className="roomInfoRow"><strong>Invite-link:</strong><a href={inviteLink}>{inviteLink}</a><button className="roomButton" type="button" onClick={() => void copyText(inviteLink)}>Копировать ссылку</button></div>
          <Link className="roomButton primary" to={routes.roomDetails.replace(':roomId', createdRoom.id)}>Перейти в комнату</Link>
        </article>
      )}
    </section>
  )
}

export default CreateRoom
