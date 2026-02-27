import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { routes } from '../../app/router/routeMap'
import { quizApi } from '../../services/quizApi'
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

const QuizCreate = () => {
  const navigate = useNavigate()
  const [mode, setMode] = useState<CreateMode>('manual')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [generationStatus, setGenerationStatus] = useState<QuizGenerationStatus | null>(null)
  const [lastAiPayload, setLastAiPayload] = useState<GenerateQuizDraftRequestDto | null>(null)

  const [topic, setTopic] = useState('')
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('medium')
  const [questionCount, setQuestionCount] = useState(10)
  const [language, setLanguage] = useState('Русский')
  const [format, setFormat] = useState<QuizQuestionFormat>('single')

  const openEditor = (draftId: string) => {
    navigate(routes.quizzesEdit.replace(':quizId', draftId))
  }

  const handleCreateManual = async () => {
    setLoading(true)
    setError('')

    try {
      const draft = await quizApi.draft()
      openEditor(draft.id)
    } catch (apiError: unknown) {
      setError(apiError instanceof Error ? apiError.message : 'Не удалось создать черновик.')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateWithAi = async (retryPayload?: GenerateQuizDraftRequestDto) => {
    const payload = retryPayload || {
      topic: topic.trim(),
      difficulty,
      questionCount,
      language: language.trim(),
      format,
    }

    if (!payload.topic) {
      setError('Укажите тему для AI-генерации.')
      return
    }

    if (!payload.language) {
      setError('Укажите язык квиза.')
      return
    }

    setLoading(true)
    setError('')
    setGenerationStatus('queued')
    setLastAiPayload(payload)

    try {
      const draft = await quizApi.generateDraft(payload, setGenerationStatus)
      setGenerationStatus('done')
      openEditor(draft.id)
    } catch (apiError: unknown) {
      setGenerationStatus('failed')
      setError(apiError instanceof Error ? apiError.message : 'Не удалось сгенерировать квиз через AI.')
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
          <button
            className={`quizButton ${mode === 'manual' ? 'primary' : ''}`}
            onClick={() => setMode('manual')}
            type="button"
          >
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
        <div className="quizPanel">
          <h2>Генерация через AI</h2>
          <div className="quizGrid">
            <label>
              Тема
              <input className="quizInput" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Например, космос" />
            </label>

            <label>
              Уровень сложности
              <select className="quizSelect" value={difficulty} onChange={(event) => setDifficulty(event.target.value as QuizDifficulty)}>
                {difficultyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Количество вопросов
              <input
                className="quizInput"
                type="number"
                min={1}
                max={50}
                value={questionCount}
                onChange={(event) => setQuestionCount(Math.max(1, Number(event.target.value) || 1))}
              />
            </label>

            <label>
              Язык
              <input className="quizInput" value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="Русский" />
            </label>

            <label>
              Формат
              <select className="quizSelect" value={format} onChange={(event) => setFormat(event.target.value as QuizQuestionFormat)}>
                {formatOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="quizQuestionActions">
            <button className="quizButton primary" onClick={() => void handleCreateWithAi()} disabled={loading}>
              {loading ? 'Генерация...' : 'Сгенерировать'}
            </button>

            {generationStatus === 'failed' && lastAiPayload && (
              <button className="quizButton" onClick={() => void handleCreateWithAi(lastAiPayload)} disabled={loading}>
                Повторить
              </button>
            )}
          </div>

          {generationStatus && <div className="quizMuted">Статус генерации: {statusLabel[generationStatus]}</div>}
        </div>
      )}

      {error && <div className="quizError">{error}</div>}
    </section>
  )
}

export default QuizCreate
