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

export interface QuizApi {
  create: (payload: CreateQuizRequestDto) => Promise<CreateQuizResponseDto>
  nextQuestion: (gameId: string) => Promise<QuizQuestionDto>
  submitAnswer: (gameId: string, answer: number) => Promise<QuizAnswerResultDto>
  list: (params?: QuizListParams) => Promise<QuizListItemDto[]>
  draft: () => Promise<QuizDraftDto>
  createDraft: () => Promise<QuizDraftDto>
  getDraft: (quizId: string) => Promise<QuizDraftDto>
  saveDraft: (quizId: string, payload: SaveQuizDraftRequestDto) => Promise<QuizDraftDto>
  publish: (quizId: string, payload?: PublishQuizRequestDto) => Promise<QuizDraftDto>
  unpublish: (quizId: string) => Promise<QuizDraftDto>
  listVersions: (quizId: string) => Promise<Array<{ version: number; updatedAt: string; status: string }>>
}

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

export const quizApi: QuizApi = {
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

  draft: () =>
    apiFetch<QuizDraftDto>(`${QUIZZES_BASE}/draft`, {
      method: 'POST',
    }),

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
