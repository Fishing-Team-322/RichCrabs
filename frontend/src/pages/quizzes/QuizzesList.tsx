import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { routes } from '../../app/router/routeMap'
import { quizApi } from '../../services/quizApi'
import type { QuizListItemDto, QuizStatus } from '../../types/quiz.types'
import './quizzes.css'

const statusOptions: Array<{ value: QuizStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
]

const QuizzesList = () => {
  const [status, setStatus] = useState<QuizStatus>('draft')
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<QuizListItemDto[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')

    void quizApi
      .list({ status, search: search.trim() || undefined })
      .then((response) => {
        if (active) {
          setItems(response)
        }
      })
      .catch((apiError: unknown) => {
        if (active) {
          setItems([])
          setError(apiError instanceof Error ? apiError.message : 'Не удалось получить список квизов.')
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
  }, [search, status])

  const emptyText = useMemo(() => {
    if (loading) return 'Загрузка...'
    if (status === 'draft') return 'У вас пока нет черновиков.'
    if (status === 'published') return 'Пока нет опубликованных квизов.'
    return 'Пока нет архивных квизов.'
  }, [loading, status])

  return (
    <section className="quizPage">
      <div className="quizPanel">
        <h1>Мои квизы</h1>
        <div className="quizToolbar">
          <select className="quizSelect" value={status} onChange={(event) => setStatus(event.target.value as QuizStatus)}>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            className="quizInput"
            placeholder="Поиск по названию"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Link to={routes.quizzesNew} className="quizButton primary">
            Создать квиз
          </Link>
        </div>
      </div>

      {error && <div className="quizError">{error}</div>}

      <ul className="quizList">
        {items.length === 0 ? (
          <li className="quizPanel quizMuted">{emptyText}</li>
        ) : (
          items.map((quiz) => (
            <li key={quiz.id} className="quizListItem">
              <div>
                <strong>{quiz.title}</strong>
                <div className="quizMuted">
                  {quiz.language} · {quiz.questionsCount} вопросов · {new Date(quiz.updatedAt).toLocaleString()}
                </div>
                <div className="quizMuted">Теги: {quiz.tags.join(', ') || '—'}</div>
              </div>
              <div className="quizQuestionActions">
                <Link to={routes.quizzesEdit.replace(':quizId', quiz.id)} className="quizButton">
                  Редактировать
                </Link>
                <Link to={routes.quizzesPublish.replace(':quizId', quiz.id)} className="quizButton">
                  Publish
                </Link>
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  )
}

export default QuizzesList
