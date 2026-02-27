import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { routes } from '../../app/router/routeMap'
import type { QuizStatus } from '../../types/quiz.types'
import { Badge, EmptyState, Input, Select, Table, Tabs } from '../../components/ui'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { fetchQuizzes, selectQuizzesByFilter, selectQuizzesError, selectQuizzesLoading } from '../../store/slices'

const statusOptions: Array<{ value: QuizStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
]

const tabItems = statusOptions.map((item) => ({ key: item.value, label: item.label }))

const QuizzesList = () => {
  const dispatch = useAppDispatch()
  const [status, setStatus] = useState<QuizStatus>('draft')
  const [search, setSearch] = useState('')
  const items = useAppSelector(selectQuizzesByFilter({ status, search }))
  const loading = useAppSelector(selectQuizzesLoading)
  const error = useAppSelector(selectQuizzesError)

  useEffect(() => {
    void dispatch(fetchQuizzes({ status, search: search.trim() || undefined }))
  }, [dispatch, search, status])

  const emptyText = useMemo(() => (loading ? 'Загрузка...' : 'В этом статусе пока нет квизов.'), [loading])

  return (
    <section className="homePage">
      <div className="pageCard homePage">
        <h1>Мои квизы</h1>
        <Tabs items={tabItems} active={status} onChange={(key) => setStatus(key as QuizStatus)} />
        <div className="homeActions">
          <div style={{ minWidth: 240, flex: 1 }}>
            <Input placeholder="Поиск по названию" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div style={{ minWidth: 160 }}>
            <Select value={status} onChange={(event) => setStatus(event.target.value as QuizStatus)}>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <Link to={routes.quizzesNew} className="ui-button primary">
            Создать квиз
          </Link>
        </div>
      </div>

      {error && <div className="ui-help">{error}</div>}

      {items.length === 0 ? (
        <EmptyState text={emptyText} />
      ) : (
        <Table headers={['Название', 'Язык', 'Вопросы', 'Обновлен', 'Действия']}>
          {items.map((quiz) => (
            <tr key={quiz.id}>
              <td>
                <strong>{quiz.title}</strong>
                <div>
                  <Badge tone="neutral">{quiz.tags.join(', ') || 'без тегов'}</Badge>
                </div>
              </td>
              <td>{quiz.language}</td>
              <td>{quiz.questionsCount}</td>
              <td>{new Date(quiz.updatedAt).toLocaleString()}</td>
              <td style={{ display: 'flex', gap: 8 }}>
                <Link to={routes.quizzesEdit.replace(':quizId', quiz.id)} className="ui-button">
                  Редактировать
                </Link>
                <Link to={routes.quizzesPublish.replace(':quizId', quiz.id)} className="ui-button primary">
                  Publish
                </Link>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </section>
  )
}

export default QuizzesList
