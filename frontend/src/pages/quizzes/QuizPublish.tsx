import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { quizApi } from '../../services/quizApi'
import type { QuizDraftDto } from '../../types/quiz.types'
import './quizzes.css'

const validateDraft = (draft: QuizDraftDto): string[] => {
  const errors: string[] = []

  if (!draft.meta.title.trim()) errors.push('Укажите название квиза.')
  if (!draft.meta.language.trim()) errors.push('Укажите язык квиза.')
  if (!draft.questions.length) errors.push('Добавьте хотя бы один вопрос.')

  draft.questions.forEach((question, index) => {
    if (!question.text.trim()) errors.push(`Вопрос #${index + 1} пустой.`)
    if (question.options.length < 2) errors.push(`У вопроса #${index + 1} должно быть минимум 2 варианта.`)
    if (!question.options.some((option) => option.id === question.correctOptionId)) {
      errors.push(`У вопроса #${index + 1} не выбран корректный ответ.`)
    }
  })

  return errors
}

const QuizPublish = () => {
  const { quizId = '' } = useParams()
  const [draft, setDraft] = useState<QuizDraftDto | null>(null)
  const [versions, setVersions] = useState<Array<{ version: number; updatedAt: string; status: string }>>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (!quizId) {
      setError('Не найден ID квиза.')
      setLoading(false)
      return
    }

    let active = true

    void Promise.all([quizApi.getDraft(quizId), quizApi.listVersions(quizId)])
      .then(([draftResponse, versionsResponse]) => {
        if (!active) return
        setDraft(draftResponse)
        setVersions(versionsResponse)
      })
      .catch((apiError: unknown) => {
        if (active) {
          setError(apiError instanceof Error ? apiError.message : 'Ошибка загрузки данных публикации.')
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

  const validationErrors = useMemo(() => (draft ? validateDraft(draft) : []), [draft])

  const publishQuiz = async () => {
    if (!quizId || !draft || validationErrors.length) return

    setBusy(true)
    setError('')
    setSuccess('')

    try {
      const response = await quizApi.publish(quizId, { version: draft.version })
      setDraft(response)
      setSuccess('Квиз успешно опубликован.')
    } catch (apiError: unknown) {
      setError(apiError instanceof Error ? apiError.message : 'Публикация не удалась.')
    } finally {
      setBusy(false)
    }
  }

  const unpublishQuiz = async () => {
    if (!quizId) return

    setBusy(true)
    setError('')
    setSuccess('')

    try {
      const response = await quizApi.unpublish(quizId)
      setDraft(response)
      setSuccess('Квиз снят с публикации.')
    } catch (apiError: unknown) {
      setError(apiError instanceof Error ? apiError.message : 'Не удалось снять публикацию.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="quizPanel">Загрузка публикации...</div>
  if (!draft) return <div className="quizError">{error || 'Черновик не найден.'}</div>

  return (
    <section className="quizPage">
      <div className="quizPanel">
        <h1>Публикация квиза</h1>
        <div className="quizMuted">Статус: {draft.status}</div>
        <div className="quizMuted">Текущая версия: {draft.version}</div>
      </div>

      <div className="quizPanel">
        <h2>Проверка валидности перед публикацией</h2>
        {validationErrors.length === 0 ? (
          <div className="quizSuccess">Валидация пройдена. Квиз можно публиковать.</div>
        ) : (
          <ul className="quizList">
            {validationErrors.map((entry) => (
              <li key={entry} className="quizError">
                {entry}
              </li>
            ))}
          </ul>
        )}

        <div className="quizQuestionActions">
          <button className="quizButton primary" disabled={busy || validationErrors.length > 0} onClick={() => void publishQuiz()}>
            {busy ? 'Публикация...' : 'Опубликовать'}
          </button>
          <button className="quizButton" disabled={busy} onClick={() => void unpublishQuiz()}>
            Снять с публикации
          </button>
        </div>
      </div>

      <div className="quizPanel">
        <h2>История версий</h2>
        <ul className="quizList">
          {versions.map((entry) => (
            <li key={entry.version} className="quizListItem">
              <span>v{entry.version}</span>
              <span className="quizMuted">{entry.status}</span>
              <span className="quizMuted">{new Date(entry.updatedAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </div>

      {success && <div className="quizSuccess">{success}</div>}
      {error && <div className="quizError">{error}</div>}
    </section>
  )
}

export default QuizPublish
