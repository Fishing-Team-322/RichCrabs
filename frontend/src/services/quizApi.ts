import { apiFetch } from './api'
import type {
  CreateQuizRequestDto,
  CreateQuizResponseDto,
  PublishQuizRequestDto,
  QuizAnswerResultDto,
  QuizDraftDto,
  QuizListItemDto,
  QuizListParams,
  QuizQuestionDto,
  SaveQuizDraftRequestDto,
} from '../types/quiz.types'

const QUIZZES_BASE = '/api/quizzes'

const toQueryString = (params: Record<string, string | undefined>): string => {
  const searchParams = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key, value)
    }
  })

  const raw = searchParams.toString()
  return raw ? `?${raw}` : ''
}

export const quizApi = {
  create: (payload: CreateQuizRequestDto) =>
    apiFetch<CreateQuizResponseDto>('/api/games/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  nextQuestion: (gameId: string) =>
    apiFetch<QuizQuestionDto>(`/api/games/${encodeURIComponent(gameId)}/question`),

  submitAnswer: (gameId: string, answer: number) =>
    apiFetch<QuizAnswerResultDto>(`/api/games/${encodeURIComponent(gameId)}/answer`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
    }),

  list: (params: QuizListParams = {}) =>
    apiFetch<QuizListItemDto[]>(
      `${QUIZZES_BASE}${toQueryString({
        status: params.status,
        search: params.search,
      })}`,
    ),

  createDraft: () =>
    apiFetch<QuizDraftDto>(`${QUIZZES_BASE}/draft`, {
      method: 'POST',
    }),

  getDraft: (quizId: string) => apiFetch<QuizDraftDto>(`${QUIZZES_BASE}/${encodeURIComponent(quizId)}/draft`),

  saveDraft: (quizId: string, payload: SaveQuizDraftRequestDto) =>
    apiFetch<QuizDraftDto>(`${QUIZZES_BASE}/${encodeURIComponent(quizId)}/draft`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  publish: (quizId: string, payload: PublishQuizRequestDto = {}) =>
    apiFetch<QuizDraftDto>(`${QUIZZES_BASE}/${encodeURIComponent(quizId)}/publish`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  unpublish: (quizId: string) =>
    apiFetch<QuizDraftDto>(`${QUIZZES_BASE}/${encodeURIComponent(quizId)}/unpublish`, {
      method: 'POST',
    }),

  listVersions: (quizId: string) =>
    apiFetch<Array<{ version: number; updatedAt: string; status: string }>>(
      `${QUIZZES_BASE}/${encodeURIComponent(quizId)}/versions`,
    ),
}
