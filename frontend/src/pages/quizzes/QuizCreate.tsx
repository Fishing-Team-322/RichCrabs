import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { routes } from '../../app/router/routeMap'
import { Progress } from '../../components/ui'
import { useNotifications } from '../../app/providers/NotificationProvider'
import { quizApi } from '../../services/quizApi'
import {
  quizCreateSchema,
  type QuizCreateFormData,
} from '../../shared/validation/formSchemas'
import type { GenerateQuizDraftRequestDto, QuizDifficulty, QuizGenerationStatus, QuizQuestionFormat } from '../../types/quiz.types'
import './quizzes.css'

type CreateMode = 'manual' | 'ai'

const difficultyOptions: Array<{ value: QuizDifficulty; label: string }> = [
  { value: 'easy', label: 'Лёгкий' },
  { value: 'medium', label: 'Средний' },
  { value: 'hard', label: 'Сложный' },
]

const formatOptions: Array<{ value: QuizQuestionFormat; label: string }> = [
  { value: 'single', label: 'Single choice' },
  { value: 'multi', label: 'Multi choice' },
]

const statusLabel: Record<QuizGenerationStatus, string> = {
  queued: 'В очереди на генерацию',
  running: 'AI генерирует вопросы',
  done: 'Генерация завершена',
  failed: 'Генерация завершилась ошибкой',
}

const statusProgress: Record<QuizGenerationStatus, number> = {
  queued: 20,
  running: 65,
  done: 100,
  failed: 100,
}

const QuizCreate = () => {
  const navigate = useNavigate()
  const notifications = useNotifications()
  const [mode, setMode] = useState<CreateMode>('manual')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [generationStatus, setGenerationStatus] = useState<QuizGenerationStatus | null>(null)
  const [lastAiPayload, setLastAiPayload] = useState<GenerateQuizDraftRequestDto | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<QuizCreateFormData>({
    resolver: zodResolver(quizCreateSchema),
    defaultValues: {
      topic: '',
      difficulty: 'medium',
      questionCount: 10,
      language: 'Русский',
      format: 'single',
    },
  })

  const openEditor = (draftId: string) => {
    navigate(routes.quizzesEdit.replace(':quizId', draftId))
  }

  const handleCreateManual = async () => {
    setLoading(true)
    setError('')

    try {
      const draft = await quizApi.draft()
      notifications.success('Черновик создан.')
      openEditor(draft.id)
    } catch (apiError: unknown) {
      const message = apiError instanceof Error ? apiError.message : 'Не удалось создать черновик.'
      setError(message)
      notifications.error(message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateWithAi = async (payload: GenerateQuizDraftRequestDto) => {
    setLoading(true)
    setError('')
    setGenerationStatus('queued')
    setLastAiPayload(payload)

    try {
      const draft = await quizApi.generateDraft(payload, setGenerationStatus)
      setGenerationStatus('done')
      notifications.success('AI-генерация завершена, открываем редактор.')
      openEditor(draft.id)
    } catch (apiError: unknown) {
      setGenerationStatus('failed')
      const message = apiError instanceof Error ? apiError.message : 'Не удалось сгенерировать квиз через AI.'
      setError(message)
      notifications.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="quizPage">
      <div className="quizPanel">
        <h1>Создание квиза</h1>
        <p className="quizMuted">Выберите режим: вручную или через AI, после чего откроется стандартный редактор.</p>

        <div className="quizModeSwitch" role="tablist" aria-label="Режим создания квиза">
          <button className={`quizButton ${mode === 'manual' ? 'primary' : ''}`} onClick={() => setMode('manual')} type="button">
            Ручной
          </button>
          <button className={`quizButton ${mode === 'ai' ? 'primary' : ''}`} onClick={() => setMode('ai')} type="button">
            Через AI
          </button>
        </div>
      </div>

      {mode === 'manual' ? (
        <div className="quizPanel">
          <h2>Ручное создание</h2>
          <p className="quizMuted">Создаётся пустой draft, который можно сразу редактировать.</p>
          <button className="quizButton primary" onClick={() => void handleCreateManual()} disabled={loading}>
            {loading ? 'Создание...' : 'Создать draft'}
          </button>
        </div>
      ) : (
        <form className="quizPanel" onSubmit={handleSubmit((data) => void handleCreateWithAi(data))}>
          <h2>Генерация через AI</h2>
          <div className="quizGrid">
            <label>
              Тема
              <input className={`quizInput ${errors.topic ? 'error' : ''}`} {...register('topic')} placeholder="Например, космос" />
              {errors.topic && <span className="ui-help">{errors.topic.message}</span>}
            </label>

            <label>
              Уровень сложности
              <select className="quizSelect" {...register('difficulty')}>
                {difficultyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Количество вопросов
              <input className={`quizInput ${errors.questionCount ? 'error' : ''}`} type="number" {...register('questionCount')} />
              {errors.questionCount && <span className="ui-help">{errors.questionCount.message}</span>}
            </label>

            <label>
              Язык
              <input className={`quizInput ${errors.language ? 'error' : ''}`} {...register('language')} placeholder="Русский" />
              {errors.language && <span className="ui-help">{errors.language.message}</span>}
            </label>

            <label>
              Формат
              <select className="quizSelect" {...register('format')}>
                {formatOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="quizQuestionActions">
            <button className="quizButton primary" type="submit" disabled={loading}>
              {loading ? 'Генерация...' : 'Сгенерировать'}
            </button>

            {generationStatus === 'failed' && lastAiPayload && (
              <button className="quizButton" onClick={() => void handleCreateWithAi(lastAiPayload)} type="button" disabled={loading}>
                Повторить
              </button>
            )}
          </div>

          {generationStatus && (
            <>
              <div className="quizMuted">Статус генерации: {statusLabel[generationStatus]}</div>
              <Progress value={statusProgress[generationStatus]} label="Прогресс AI-операции" />
            </>
          )}
        </form>
      )}

      {error && <div className="quizError">{error}</div>}
    </section>
  )
}

export default QuizCreate
