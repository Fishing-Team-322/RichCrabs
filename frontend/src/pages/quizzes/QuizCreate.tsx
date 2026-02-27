import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { routes } from '../../app/router/routeMap'
import { Progress } from '../../components/ui'
import { useNotifications } from '../../app/providers/NotificationProvider'
import { quizApi } from '../../services/quizApi'
import { validateQuizCreate, type QuizCreateFormData } from '../../shared/validation/formSchemas'
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

const statusProgress: Record<QuizGenerationStatus, number> = { queued: 20, running: 65, done: 100, failed: 100 }

const QuizCreate = () => {
  const navigate = useNavigate()
  const notifications = useNotifications()
  const [mode, setMode] = useState<CreateMode>('manual')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [generationStatus, setGenerationStatus] = useState<QuizGenerationStatus | null>(null)
  const [lastAiPayload, setLastAiPayload] = useState<GenerateQuizDraftRequestDto | null>(null)
  const [form, setForm] = useState<QuizCreateFormData>({ topic: '', difficulty: 'medium', questionCount: 10, language: 'Русский', format: 'single' })
  const [formErrors, setFormErrors] = useState<Partial<Record<'topic' | 'questionCount' | 'language', string>>>({})

  const openEditor = (draftId: string) => navigate(routes.quizzesEdit.replace(':quizId', draftId))

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

  const submitAi = async (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateQuizCreate(form)
    if (Object.keys(nextErrors).length) {
      setFormErrors(nextErrors)
      return
    }
    setFormErrors({})
    await handleCreateWithAi(form)
  }

  return (
    <section className="quizPage">
      <div className="quizPanel">
        <h1>Создание квиза</h1>
        <p className="quizMuted">Выберите режим: вручную или через AI, после чего откроется стандартный редактор.</p>
        <div className="quizModeSwitch" role="tablist" aria-label="Режим создания квиза">
          <button className={`quizButton ${mode === 'manual' ? 'primary' : ''}`} onClick={() => setMode('manual')} type="button">Ручной</button>
          <button className={`quizButton ${mode === 'ai' ? 'primary' : ''}`} onClick={() => setMode('ai')} type="button">Через AI</button>
        </div>
      </div>

      {mode === 'manual' ? (
        <div className="quizPanel">
          <h2>Ручное создание</h2>
          <p className="quizMuted">Создаётся пустой draft, который можно сразу редактировать.</p>
          <button className="quizButton primary" onClick={() => void handleCreateManual()} disabled={loading}>{loading ? 'Создание...' : 'Создать draft'}</button>
        </div>
      ) : (
        <form className="quizPanel" onSubmit={(event) => void submitAi(event)}>
          <h2>Генерация через AI</h2>
          <div className="quizGrid">
            <label>Тема
              <input className={`quizInput ${formErrors.topic ? 'error' : ''}`} value={form.topic} onChange={(event) => setForm((prev) => ({ ...prev, topic: event.target.value }))} placeholder="Например, космос" />
              {formErrors.topic && <span className="ui-help">{formErrors.topic}</span>}
            </label>
            <label>Уровень сложности
              <select className="quizSelect" value={form.difficulty} onChange={(event) => setForm((prev) => ({ ...prev, difficulty: event.target.value as QuizDifficulty }))}>
                {difficultyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>Количество вопросов
              <input className={`quizInput ${formErrors.questionCount ? 'error' : ''}`} type="number" value={form.questionCount} onChange={(event) => setForm((prev) => ({ ...prev, questionCount: Number(event.target.value) || 0 }))} />
              {formErrors.questionCount && <span className="ui-help">{formErrors.questionCount}</span>}
            </label>
            <label>Язык
              <input className={`quizInput ${formErrors.language ? 'error' : ''}`} value={form.language} onChange={(event) => setForm((prev) => ({ ...prev, language: event.target.value }))} placeholder="Русский" />
              {formErrors.language && <span className="ui-help">{formErrors.language}</span>}
            </label>
            <label>Формат
              <select className="quizSelect" value={form.format} onChange={(event) => setForm((prev) => ({ ...prev, format: event.target.value as QuizQuestionFormat }))}>
                {formatOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <div className="quizQuestionActions">
            <button className="quizButton primary" type="submit" disabled={loading}>{loading ? 'Генерация...' : 'Сгенерировать'}</button>
            {generationStatus === 'failed' && lastAiPayload && <button className="quizButton" onClick={() => void handleCreateWithAi(lastAiPayload)} type="button" disabled={loading}>Повторить</button>}
          </div>
          {generationStatus && <><div className="quizMuted">Статус генерации: {statusLabel[generationStatus]}</div><Progress value={statusProgress[generationStatus]} label="Прогресс AI-операции" /></>}
        </form>
      )}
      {error && <div className="quizError">{error}</div>}
    </section>
  )
}

export default QuizCreate
