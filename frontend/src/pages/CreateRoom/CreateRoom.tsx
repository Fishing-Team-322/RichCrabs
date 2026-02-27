import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { routes } from '../../app/router/routeMap'
import { Skeleton } from '../../components/ui'
import { useNotifications } from '../../app/providers/NotificationProvider'
import { quizApi } from '../../services/quizApi'
import { roomsApi } from '../../services/roomsApi'
import { createRoomSchema, type CreateRoomFormData } from '../../shared/validation/formSchemas'
import type { QuizListItemDto } from '../../types/quiz.types'
import type { CreateRoomRequestDto, RoomDetailsDto } from '../../types/room.types'
import '../rooms/rooms.css'

const CreateRoom = () => {
  const notifications = useNotifications()
  const [quizzes, setQuizzes] = useState<QuizListItemDto[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [createdRoom, setCreatedRoom] = useState<RoomDetailsDto | null>(null)

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CreateRoomFormData>({
    resolver: zodResolver(createRoomSchema),
    defaultValues: {
      quizId: '',
      playerLimit: 20,
      privacy: 'private',
      lobbyTimerSec: 45,
      questionTimerSec: 30,
      answerRevealSec: 10,
    },
  })

  useEffect(() => {
    let active = true
    setLoading(true)
    void quizApi
      .list({ status: 'published' })
      .then((items) => {
        if (!active) return
        setQuizzes(items)
        if (items[0]) {
          setValue('quizId', items[0].id, { shouldValidate: true })
        }
      })
      .catch((apiError: unknown) => {
        if (active) {
          const message = apiError instanceof Error ? apiError.message : 'Не удалось получить опубликованные квизы.'
          setError(message)
          notifications.error(message)
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
  }, [notifications, setValue])

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
      notifications.success('Скопировано в буфер обмена.')
    } catch {
      const message = 'Не удалось скопировать в буфер обмена.'
      setError(message)
      notifications.error(message)
    }
  }

  const onSubmit = async (data: CreateRoomFormData) => {
    setSaving(true)
    setError('')
    try {
      const payload: CreateRoomRequestDto = {
        quizId: data.quizId,
        settings: {
          playerLimit: data.playerLimit,
          privacy: data.privacy,
          timers: {
            lobbyTimerSec: data.lobbyTimerSec,
            questionTimerSec: data.questionTimerSec,
            answerRevealSec: data.answerRevealSec,
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

      <form className="pageCard roomForm" onSubmit={handleSubmit((data) => void onSubmit(data))}>
        {loading ? (
          <>
            <Skeleton height={42} />
            <Skeleton height={42} />
            <Skeleton height={42} />
          </>
        ) : (
          <>
            <label>
              Квиз
              <Controller
                name="quizId"
                control={control}
                render={({ field }) => (
                  <select {...field} disabled={quizzes.length === 0} className={errors.quizId ? 'error' : ''}>
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
                )}
              />
              {errors.quizId && <span className="ui-help">{errors.quizId.message}</span>}
            </label>

            <label>
              Лимит игроков
              <input type="number" {...register('playerLimit')} className={errors.playerLimit ? 'error' : ''} />
              {errors.playerLimit && <span className="ui-help">{errors.playerLimit.message}</span>}
            </label>

            <label>
              Приватность
              <select {...register('privacy')}>
                <option value="private">Приватная (по PIN/invite)</option>
                <option value="public">Публичная (видна в open games)</option>
              </select>
            </label>

            <div className="roomsGrid">
              <label>
                Таймер лобби (сек)
                <input type="number" {...register('lobbyTimerSec')} className={errors.lobbyTimerSec ? 'error' : ''} />
                {errors.lobbyTimerSec && <span className="ui-help">{errors.lobbyTimerSec.message}</span>}
              </label>
              <label>
                Таймер вопроса (сек)
                <input type="number" {...register('questionTimerSec')} className={errors.questionTimerSec ? 'error' : ''} />
                {errors.questionTimerSec && <span className="ui-help">{errors.questionTimerSec.message}</span>}
              </label>
              <label>
                Пауза перед ответом (сек)
                <input type="number" {...register('answerRevealSec')} className={errors.answerRevealSec ? 'error' : ''} />
                {errors.answerRevealSec && <span className="ui-help">{errors.answerRevealSec.message}</span>}
              </label>
            </div>
          </>
        )}

        <button className="roomButton primary" disabled={saving || quizzes.length === 0 || loading}>
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
