import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { routes } from '../../app/router/routeMap'
import { quizApi } from '../../services/quizApi'
import { roomsApi } from '../../services/roomsApi'
import type { QuizListItemDto } from '../../types/quiz.types'
import type { CreateRoomRequestDto, RoomDetailsDto, RoomVisibility } from '../../types/room.types'
import '../rooms/rooms.css'

const CreateRoom = () => {
  const [quizzes, setQuizzes] = useState<QuizListItemDto[]>([])
  const [quizId, setQuizId] = useState('')
  const [playerLimit, setPlayerLimit] = useState(20)
  const [privacy, setPrivacy] = useState<RoomVisibility>('private')
  const [lobbyTimerSec, setLobbyTimerSec] = useState(45)
  const [questionTimerSec, setQuestionTimerSec] = useState(30)
  const [answerRevealSec, setAnswerRevealSec] = useState(10)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [createdRoom, setCreatedRoom] = useState<RoomDetailsDto | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    void quizApi
      .list({ status: 'published' })
      .then((items) => {
        if (!active) return
        setQuizzes(items)
        if (!quizId && items[0]) {
          setQuizId(items[0].id)
        }
      })
      .catch((apiError: unknown) => {
        if (active) {
          setError(apiError instanceof Error ? apiError.message : 'Не удалось получить опубликованные квизы.')
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [quizId])

  const inviteLink = useMemo(() => {
    if (!createdRoom?.inviteLink) return ''
    if (/^https?:\/\//.test(createdRoom.inviteLink)) {
      return createdRoom.inviteLink
    }
    return `${window.location.origin}${createdRoom.inviteLink}`
  }, [createdRoom])

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      setError('Не удалось скопировать в буфер обмена.')
    }
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!quizId) {
      setError('Выберите опубликованный квиз.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const payload: CreateRoomRequestDto = {
        quizId,
        settings: {
          playerLimit,
          privacy,
          timers: {
            lobbyTimerSec,
            questionTimerSec,
            answerRevealSec,
          },
        },
      }
      const room = await roomsApi.create(payload)
      setCreatedRoom(room)
    } catch (apiError: unknown) {
      setError(apiError instanceof Error ? apiError.message : 'Не удалось создать комнату.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="roomsPage">
      <div className="pageCard roomsHeader">
        <div>
          <h1>Создание комнаты</h1>
          <p>Выберите опубликованный квиз и задайте правила комнаты.</p>
        </div>
        <Link className="roomLink" to={routes.rooms}>
          К списку комнат
        </Link>
      </div>

      {error && <div className="roomError">{error}</div>}

      <form className="pageCard roomForm" onSubmit={onSubmit}>
        <label>
          Квиз
          <select value={quizId} onChange={(event) => setQuizId(event.target.value)} disabled={loading || quizzes.length === 0}>
            {quizzes.length === 0 ? (
              <option value="">Нет опубликованных квизов</option>
            ) : (
              quizzes.map((quiz) => (
                <option key={quiz.id} value={quiz.id}>
                  {quiz.title} · {quiz.questionsCount} вопросов
                </option>
              ))
            )}
          </select>
        </label>

        <label>
          Лимит игроков
          <input
            type="number"
            min={2}
            max={200}
            value={playerLimit}
            onChange={(event) => setPlayerLimit(Number(event.target.value) || 2)}
          />
        </label>

        <label>
          Приватность
          <select value={privacy} onChange={(event) => setPrivacy(event.target.value as RoomVisibility)}>
            <option value="private">Приватная (по PIN/invite)</option>
            <option value="public">Публичная (видна в open games)</option>
          </select>
        </label>

        <div className="roomsGrid">
          <label>
            Таймер лобби (сек)
            <input type="number" min={10} max={600} value={lobbyTimerSec} onChange={(event) => setLobbyTimerSec(Number(event.target.value) || 10)} />
          </label>
          <label>
            Таймер вопроса (сек)
            <input
              type="number"
              min={5}
              max={300}
              value={questionTimerSec}
              onChange={(event) => setQuestionTimerSec(Number(event.target.value) || 5)}
            />
          </label>
          <label>
            Пауза перед ответом (сек)
            <input
              type="number"
              min={3}
              max={120}
              value={answerRevealSec}
              onChange={(event) => setAnswerRevealSec(Number(event.target.value) || 3)}
            />
          </label>
        </div>

        <button className="roomButton primary" disabled={saving || quizzes.length === 0}>
          {saving ? 'Создание...' : 'Создать комнату'}
        </button>
      </form>

      {createdRoom && (
        <article className="pageCard roomForm">
          <h2>Комната создана</h2>
          <div className="roomInfoRow">
            <strong>PIN:</strong> <code>{createdRoom.pin}</code>
            <button className="roomButton" type="button" onClick={() => void copyText(createdRoom.pin)}>
              Копировать PIN
            </button>
          </div>
          <div className="roomInfoRow">
            <strong>Invite-link:</strong>
            <a href={inviteLink}>{inviteLink}</a>
            <button className="roomButton" type="button" onClick={() => void copyText(inviteLink)}>
              Копировать ссылку
            </button>
          </div>
          <Link className="roomButton primary" to={routes.roomDetails.replace(':roomId', createdRoom.id)}>
            Перейти в комнату
          </Link>
        </article>
      )}
    </section>
  )
}

export default CreateRoom
