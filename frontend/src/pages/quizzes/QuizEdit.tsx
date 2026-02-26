import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { quizApi } from '../../services/quizApi'
import type {
  QuizDifficulty,
  QuizDraftDto,
  QuizEditorOptionDto,
  QuizEditorQuestionDto,
  SaveQuizDraftRequestDto,
} from '../../types/quiz.types'
import './quizzes.css'

const difficultyOptions: QuizDifficulty[] = ['easy', 'medium', 'hard']

const createOption = (): QuizEditorOptionDto => ({
  id: crypto.randomUUID(),
  text: '',
})

const createQuestion = (): QuizEditorQuestionDto => {
  const firstOption = createOption()
  const secondOption = createOption()

  return {
    id: crypto.randomUUID(),
    text: '',
    options: [firstOption, secondOption],
    correctOptionId: firstOption.id,
    timeLimitSec: 30,
    difficulty: 'easy',
  }
}

const QuizEdit = () => {
  const { quizId = '' } = useParams()
  const [draft, setDraft] = useState<QuizDraftDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const lastSavedSnapshot = useRef('')

  useEffect(() => {
    if (!quizId) {
      setError('Не найден ID квиза.')
      setLoading(false)
      return
    }

    let active = true
    setLoading(true)
    setError('')

    void quizApi
      .getDraft(quizId)
      .then((response) => {
        if (active) {
          setDraft(response)
          lastSavedSnapshot.current = JSON.stringify({ meta: response.meta, questions: response.questions })
        }
      })
      .catch((apiError: unknown) => {
        if (active) {
          setError(apiError instanceof Error ? apiError.message : 'Не удалось загрузить черновик.')
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

  const payload = useMemo<SaveQuizDraftRequestDto | null>(() => {
    if (!draft) return null
    return {
      meta: draft.meta,
      questions: draft.questions,
    }
  }, [draft])

  useEffect(() => {
    if (!quizId || !payload || loading) return

    const payloadSnapshot = JSON.stringify(payload)
    if (payloadSnapshot === lastSavedSnapshot.current) return

    const timeoutId = window.setTimeout(() => {
      setSaveState('saving')
      void quizApi
        .saveDraft(quizId, payload)
        .then((response) => {
          setDraft(response)
          lastSavedSnapshot.current = JSON.stringify({ meta: response.meta, questions: response.questions })
          setSaveState('saved')
        })
        .catch(() => {
          setSaveState('error')
        })
    }, 900)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [payload, quizId, loading])

  const patchDraft = (updater: (previous: QuizDraftDto) => QuizDraftDto) => {
    setDraft((current) => (current ? updater(current) : current))
    setSaveState('idle')
  }

  if (loading) return <div className="quizPanel">Загрузка редактора...</div>
  if (!draft) return <div className="quizError">{error || 'Черновик не найден.'}</div>

  return (
    <section className="quizPage">
      <div className="quizPanel">
        <h1>Редактор квиза</h1>
        <div className="quizGrid">
          <label>
            Название
            <input
              className="quizInput"
              value={draft.meta.title}
              onChange={(event) =>
                patchDraft((previous) => ({
                  ...previous,
                  meta: { ...previous.meta, title: event.target.value },
                }))
              }
            />
          </label>
          <label>
            Язык
            <input
              className="quizInput"
              value={draft.meta.language}
              onChange={(event) =>
                patchDraft((previous) => ({
                  ...previous,
                  meta: { ...previous.meta, language: event.target.value },
                }))
              }
            />
          </label>
          <label>
            Теги (через запятую)
            <input
              className="quizInput"
              value={draft.meta.tags.join(', ')}
              onChange={(event) =>
                patchDraft((previous) => ({
                  ...previous,
                  meta: {
                    ...previous.meta,
                    tags: event.target.value
                      .split(',')
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  },
                }))
              }
            />
          </label>
          <label>
            Обложка (URL)
            <input
              className="quizInput"
              value={draft.meta.coverUrl}
              onChange={(event) =>
                patchDraft((previous) => ({
                  ...previous,
                  meta: { ...previous.meta, coverUrl: event.target.value },
                }))
              }
            />
          </label>
        </div>
      </div>

      <div className="quizPanel">
        <div className="quizQuestionHeader">
          <h2>Вопросы</h2>
          <button
            className="quizButton"
            onClick={() =>
              patchDraft((previous) => ({
                ...previous,
                questions: [...previous.questions, createQuestion()],
              }))
            }
          >
            + Добавить вопрос
          </button>
        </div>

        <div className="quizPage">
          {draft.questions.map((question, questionIndex) => (
            <article className="quizQuestionCard" key={question.id}>
              <div className="quizQuestionHeader">
                <strong>Вопрос #{questionIndex + 1}</strong>
                <button
                  className="quizButton danger"
                  onClick={() =>
                    patchDraft((previous) => ({
                      ...previous,
                      questions: previous.questions.filter((item) => item.id !== question.id),
                    }))
                  }
                >
                  Удалить
                </button>
              </div>

              <textarea
                className="quizTextArea"
                value={question.text}
                onChange={(event) =>
                  patchDraft((previous) => ({
                    ...previous,
                    questions: previous.questions.map((item) =>
                      item.id === question.id ? { ...item, text: event.target.value } : item,
                    ),
                  }))
                }
                placeholder="Введите формулировку вопроса"
              />

              <div className="quizInlineFields">
                <label>
                  Лимит времени (сек)
                  <input
                    className="quizInput"
                    type="number"
                    min={5}
                    max={300}
                    value={question.timeLimitSec}
                    onChange={(event) =>
                      patchDraft((previous) => ({
                        ...previous,
                        questions: previous.questions.map((item) =>
                          item.id === question.id ? { ...item, timeLimitSec: Number(event.target.value) || 5 } : item,
                        ),
                      }))
                    }
                  />
                </label>

                <label>
                  Сложность
                  <select
                    className="quizSelect"
                    value={question.difficulty}
                    onChange={(event) =>
                      patchDraft((previous) => ({
                        ...previous,
                        questions: previous.questions.map((item) =>
                          item.id === question.id
                            ? { ...item, difficulty: event.target.value as QuizDifficulty }
                            : item,
                        ),
                      }))
                    }
                  >
                    {difficultyOptions.map((difficulty) => (
                      <option key={difficulty} value={difficulty}>
                        {difficulty}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {question.options.map((option) => (
                <div className="quizOptionRow" key={option.id}>
                  <input
                    type="radio"
                    name={`correct-${question.id}`}
                    checked={question.correctOptionId === option.id}
                    onChange={() =>
                      patchDraft((previous) => ({
                        ...previous,
                        questions: previous.questions.map((item) =>
                          item.id === question.id ? { ...item, correctOptionId: option.id } : item,
                        ),
                      }))
                    }
                  />
                  <input
                    className="quizInput"
                    value={option.text}
                    onChange={(event) =>
                      patchDraft((previous) => ({
                        ...previous,
                        questions: previous.questions.map((item) =>
                          item.id === question.id
                            ? {
                                ...item,
                                options: item.options.map((entry) =>
                                  entry.id === option.id ? { ...entry, text: event.target.value } : entry,
                                ),
                              }
                            : item,
                        ),
                      }))
                    }
                    placeholder="Текст варианта"
                  />
                  <button
                    className="quizButton"
                    onClick={() =>
                      patchDraft((previous) => ({
                        ...previous,
                        questions: previous.questions.map((item) => {
                          if (item.id !== question.id || item.options.length <= 2) return item

                          const nextOptions = item.options.filter((entry) => entry.id !== option.id)
                          const fallbackCorrect =
                            item.correctOptionId === option.id ? nextOptions[0]?.id || '' : item.correctOptionId

                          return {
                            ...item,
                            options: nextOptions,
                            correctOptionId: fallbackCorrect,
                          }
                        }),
                      }))
                    }
                  >
                    Удалить вариант
                  </button>
                </div>
              ))}

              <button
                className="quizButton"
                onClick={() =>
                  patchDraft((previous) => ({
                    ...previous,
                    questions: previous.questions.map((item) =>
                      item.id === question.id ? { ...item, options: [...item.options, createOption()] } : item,
                    ),
                  }))
                }
              >
                + Добавить вариант
              </button>
            </article>
          ))}
        </div>
      </div>

      {saveState === 'saving' && <div className="quizMuted">Автосохранение...</div>}
      {saveState === 'saved' && <div className="quizSuccess">Черновик сохранён.</div>}
      {saveState === 'error' && <div className="quizError">Ошибка автосохранения.</div>}
      {error && <div className="quizError">{error}</div>}
    </section>
  )
}

export default QuizEdit
