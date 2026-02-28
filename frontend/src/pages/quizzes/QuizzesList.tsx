import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { routes } from '../../app/router/routeMap'
import type { ChangeEvent, UIEvent } from 'react'
import type { QuizListItemDto, QuizStatus } from '../../types/quiz.types'
import { Badge, EmptyState, Input, Select, Table, Tabs } from '../../components/ui'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { fetchQuizzes, selectQuizzesByFilter, selectQuizzesError, selectQuizzesLoading } from '../../store/slices'

const statusOptions: Array<{ value: QuizStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
]

const tabItems = statusOptions.map((item) => ({ key: item.value, label: item.label }))
const VIRTUALIZATION_THRESHOLD = 20
const ROW_HEIGHT = 92
const VIEWPORT_HEIGHT = 540

const QuizRow = memo(({ quiz }: { quiz: QuizListItemDto }) => (
  <tr>
    <td>
      <strong>{quiz.title}</strong>
      <div>
        <Badge tone="neutral">{quiz.tags.join(', ') || 'без тегов'}</Badge>
      </div>
    </td>
    <td>{quiz.language}</td>
    <td>{quiz.questionsCount}</td>
    <td>{new Date(quiz.updatedAt).toLocaleString()}</td>
    <td className="quizActionsCell">
      <Link to={routes.quizzesEdit.replace(':quizId', quiz.id)} className="ui-button">
        Редактировать
      </Link>
      <Link to={routes.quizzesPublish.replace(':quizId', quiz.id)} className="ui-button primary">
        Publish
      </Link>
    </td>
  </tr>
))

const QuizzesList = () => {
  const dispatch = useAppDispatch()
  const [status, setStatus] = useState<QuizStatus>('draft')
  const [search, setSearch] = useState('')
  const quizzesSelector = useMemo(() => selectQuizzesByFilter({ status, search }), [search, status])
  const items = useAppSelector(quizzesSelector)
  const loading = useAppSelector(selectQuizzesLoading)
  const error = useAppSelector(selectQuizzesError)
  const [scrollTop, setScrollTop] = useState(0)

  useEffect(() => {
    void dispatch(fetchQuizzes({ status, search: search.trim() || undefined }))
  }, [dispatch, search, status])

  const emptyText = useMemo(() => (loading ? 'Загрузка...' : 'В этом статусе пока нет квизов.'), [loading])
  const virtualized = items.length >= VIRTUALIZATION_THRESHOLD

  const startIndex = Math.floor(scrollTop / ROW_HEIGHT)
  const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + 6
  const endIndex = Math.min(items.length, startIndex + visibleCount)
  const visibleItems = virtualized ? items.slice(startIndex, endIndex) : items
  const topSpacerHeight = virtualized ? startIndex * ROW_HEIGHT : 0
  const bottomSpacerHeight = virtualized ? Math.max(0, (items.length - endIndex) * ROW_HEIGHT) : 0

  const onTabsChange = useCallback((key: string) => setStatus(key as QuizStatus), [])
  const onSearchChange = useCallback((event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value), [])
  const onSelectChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => setStatus(event.target.value as QuizStatus), [])
  const onTableScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop)
  }, [])

  return (
    <section className="quizPage">
      <div className="pageCard">
        <h1>Мои квизы</h1>
        <Tabs items={tabItems} active={status} onChange={onTabsChange} />
        <div className="quizToolbar">
          <div style={{ minWidth: 0, flex: 1 }}>
            <Input placeholder="Поиск по названию" value={search} onChange={onSearchChange} />
          </div>
          <div style={{ minWidth: 160 }}>
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
        <div onScroll={onTableScroll} style={virtualized ? { maxHeight: VIEWPORT_HEIGHT, overflowY: 'auto' } : undefined}>
          <Table headers={['Название', 'Язык', 'Вопросы', 'Обновлен', 'Действия']}>
            {topSpacerHeight > 0 ? (
              <tr aria-hidden="true">
                <td colSpan={5} style={{ height: topSpacerHeight, padding: 0, border: 0 }} />
              </tr>
            ) : null}
            {visibleItems.map((quiz) => (
              <QuizRow key={quiz.id} quiz={quiz} />
            ))}
            {bottomSpacerHeight > 0 ? (
              <tr aria-hidden="true">
                <td colSpan={5} style={{ height: bottomSpacerHeight, padding: 0, border: 0 }} />
              </tr>
            ) : null}
          </Table>
        </div>
      )}
    </section>
  )
}

export default QuizzesList
