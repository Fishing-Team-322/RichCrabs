import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { routes } from '../../app/router/routeMap'
import type { ChangeEvent } from 'react'
import type { QuizListItemDto, QuizStatus } from '../../types/quiz.types'
import { Badge, EmptyState, Input, Select, Tabs } from '../../components/ui'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { fetchQuizzes, selectQuizzesByFilter, selectQuizzesError, selectQuizzesLoading } from '../../store/slices'
import './quizzes.css'

const statusOptions: Array<{ value: QuizStatus; label: string }> = [
  { value: 'draft', label: 'Черновики' },
  { value: 'published', label: 'Опубликованные' },
  { value: 'archived', label: 'Архив' },
]

const tabItems = statusOptions.map((item) => ({ key: item.value, label: item.label }))

const QuizCard = memo(({ quiz }: { quiz: QuizListItemDto }) => (
  <li className="quizCatalogCard">
    <div className="quizCatalogHeader">
      <div>
        <strong>{quiz.title}</strong>
        <div>
          <Badge tone="neutral">{quiz.tags.join(', ') || 'без тегов'}</Badge>
        </div>
      </div>
      <div className="quizCatalogActions">
        <Link to={routes.quizzesEdit.replace(':quizId', quiz.id)} className="ui-button">
          Редактировать
        </Link>
        <Link to={routes.quizzesPublish.replace(':quizId', quiz.id)} className="ui-button primary">
          Опубликовать
        </Link>
      </div>
    </div>

    <dl className="quizCatalogMeta">
      <div>
        <dt>Язык</dt>
        <dd>{quiz.language}</dd>
      </div>
      <div>
        <dt>Вопросы</dt>
        <dd>{quiz.questionsCount}</dd>
      </div>
      <div>
        <dt>Обновлен</dt>
        <dd>{new Date(quiz.updatedAt).toLocaleString('ru-RU')}</dd>
      </div>
    </dl>
  </li>
))

const QuizzesList = () => {
  const dispatch = useAppDispatch()
  const [status, setStatus] = useState<QuizStatus>('draft')
  const [search, setSearch] = useState('')
  const quizzesSelector = useMemo(() => selectQuizzesByFilter({ status, search }), [search, status])
  const items = useAppSelector(quizzesSelector)
  const loading = useAppSelector(selectQuizzesLoading)
  const error = useAppSelector(selectQuizzesError)

  useEffect(() => {
    void dispatch(fetchQuizzes({ status, search: search.trim() || undefined }))
  }, [dispatch, search, status])

  const emptyText = useMemo(() => (loading ? 'Загрузка...' : 'В этом статусе пока нет квизов.'), [loading])

  const onTabsChange = useCallback((key: string) => setStatus(key as QuizStatus), [])
  const onSearchChange = useCallback((event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value), [])
  const onSelectChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => setStatus(event.target.value as QuizStatus), [])

  return (
    <section className="quizPage quizzesCatalogPage">
      <div className="pageCard quizzesCatalogHeaderCard">
        <h1>Мои квизы</h1>
        <Tabs items={tabItems} active={status} onChange={onTabsChange} />
        <div className="quizToolbar quizzesCatalogToolbar">
          <div style={{ minWidth: 0, flex: 1 }}>
            <Input placeholder="Поиск по названию" value={search} onChange={onSearchChange} />
          </div>
          <div style={{ minWidth: 180 }}>
            <Select value={status} onChange={onSelectChange}>
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
        <ul className="quizCatalogList">
          {items.map((quiz) => (
            <QuizCard key={quiz.id} quiz={quiz} />
          ))}
        </ul>
      )}
    </section>
  )
}

export default QuizzesList
