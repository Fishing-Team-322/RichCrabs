import { apiFetch } from './api'
import type {
  CreateQuizRequestDto,
  CreateQuizResponseDto,
  GenerateQuizDraftRequestDto,
  GenerateQuizJobDto,
  PublishQuizRequestDto,
  QuizAnswerResultDto,
  QuizDraftDto,
  QuizListItemDto,
  QuizListParams,
  QuizQuestionDto,
  SaveQuizDraftRequestDto,
} from '../types/quiz.types'

const QUIZZES_BASE = '/api/v1/quizzes'

export interface QuizApi {
  create: (payload: CreateQuizRequestDto) => Promise<CreateQuizResponseDto>
  nextQuestion: (gameId: string) => Promise<QuizQuestionDto>
  submitAnswer: (gameId: string, answer: number) => Promise<QuizAnswerResultDto>
  list: (params?: QuizListParams) => Promise<QuizListItemDto[]>
  draft: () => Promise<QuizDraftDto>
  createDraft: () => Promise<QuizDraftDto>
  startGeneration: (payload: GenerateQuizDraftRequestDto) => Promise<GenerateQuizJobDto>
  getGenerationStatus: (jobId: string) => Promise<GenerateQuizJobDto>
  generateDraft: (
    payload: GenerateQuizDraftRequestDto,
    onStatus?: (status: GenerateQuizJobDto['status']) => void,
  ) => Promise<QuizDraftDto>
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

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })

const defaultQuestionPayload = () => ([
  {
    id: 'q1',
    text: 'Новый вопрос',
    options: ['Вариант 1', 'Вариант 2'],
    correctIndex: 0,
  },
])

const mapQuizToDraft = (quiz: {
  quizId: string
  title?: string
  description?: string
  questions?: Array<{ id: string; text: string; options: string[]; correctIndex?: number | null }>
}): QuizDraftDto => ({
  id: quiz.quizId,
  meta: {
    title: quiz.title || 'Untitled quiz',
    language: 'ru',
    tags: [],
    coverUrl: '',
  },
  questions: (quiz.questions || []).map((question) => ({
    id: question.id,
    text: question.text,
    options: question.options.map((option, index) => ({ id: `${question.id}-${index}`, text: option })),
    correctOptionId: `${question.id}-${question.correctIndex || 0}`,
    timeLimitSec: 20,
    difficulty: 'medium',
  })),
  status: 'draft',
  version: 1,
  updatedAt: new Date().toISOString(),
})

export const quizApi: QuizApi = {
  create: (payload: CreateQuizRequestDto) =>
    apiFetch<{ quiz: { quizId: string } }>(QUIZZES_BASE, {
      method: 'POST',
      body: JSON.stringify({ title: payload.topic, description: '', questions: defaultQuestionPayload() }),
    }).then((res) => ({ creatorToken: '', gameId: res.quiz.quizId, pin: '' })),

  nextQuestion: (gameId: string) =>
    apiFetch<QuizQuestionDto>(`/api/v1/games/${encodeURIComponent(gameId)}/question`),

  submitAnswer: (gameId: string, answer: number) =>
    apiFetch<QuizAnswerResultDto>(`/api/v1/games/${encodeURIComponent(gameId)}/answer`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
    }),

  list: (params: QuizListParams = {}) =>
    apiFetch<{ items: Array<{ quizId: string; title: string; questions?: unknown[] }> }>(
      `${QUIZZES_BASE}${toQueryString({ ownerUserId: params.search })}`,
    ).then((res) =>
      res.items.map((item) => ({
        id: item.quizId,
        title: item.title,
        language: 'ru',
        tags: [],
        status: 'draft',
        updatedAt: new Date().toISOString(),
        questionsCount: item.questions?.length || 0,
      })),
    ),

  draft: () =>
    apiFetch<{ quiz: { quizId: string; title?: string; description?: string; questions?: Array<{ id: string; text: string; options: string[] }> } }>(
      QUIZZES_BASE,
      {
        method: 'POST',
        body: JSON.stringify({ title: 'Новый квиз', questions: defaultQuestionPayload() }),
      },
    ).then((res) => mapQuizToDraft(res.quiz)),

  createDraft: () => quizApi.draft(),

  startGeneration: (payload: GenerateQuizDraftRequestDto) =>
    apiFetch<GenerateQuizJobDto>(`${QUIZZES_BASE}/ai-generate`, {
      method: 'POST',
      body: JSON.stringify({
        prompt: payload.topic,
        desiredQuestionCount: payload.questionCount,
        difficulty: payload.difficulty,
        language: payload.language,
        format: payload.format,
      }),
    }),

  getGenerationStatus: (jobId: string) => apiFetch<GenerateQuizJobDto>(`${QUIZZES_BASE}/ai-jobs/${encodeURIComponent(jobId)}`),

  generateDraft: async (payload: GenerateQuizDraftRequestDto, onStatus) => {
    const started = await quizApi.startGeneration(payload)
    let currentJob = started
    onStatus?.(currentJob.status)

    for (let attempt = 0; attempt < 90; attempt += 1) {
      if (currentJob.status === 'done') {
        const draftId = currentJob.draftId || (currentJob as { quiz?: { quizId?: string } }).quiz?.quizId
        if (!draftId) {
          throw new Error('Генерация завершена, но ID черновика отсутствует.')
        }
        return quizApi.getDraft(draftId)
      }

      if (currentJob.status === 'failed') {
        throw new Error((currentJob as { error?: string; errorMessage?: string }).error || (currentJob as { error?: string; errorMessage?: string }).errorMessage || 'Генерация квиза завершилась с ошибкой.')
      }

      await sleep(1500)
      currentJob = await quizApi.getGenerationStatus(currentJob.jobId)
      onStatus?.(currentJob.status)
    }

    throw new Error('Превышено время ожидания генерации. Попробуйте ещё раз.')
  },

  getDraft: (quizId: string) =>
    apiFetch<{ quiz: { quizId: string; title?: string; description?: string; questions?: Array<{ id: string; text: string; options: string[]; correctIndex?: number | null }> } }>(
      `${QUIZZES_BASE}/${encodeURIComponent(quizId)}`,
    ).then((res) => mapQuizToDraft(res.quiz)),

  saveDraft: (quizId: string, payload: SaveQuizDraftRequestDto) =>
    apiFetch<{ quiz: { quizId: string; title?: string; description?: string; questions?: Array<{ id: string; text: string; options: string[]; correctIndex?: number | null }> } }>(
      `${QUIZZES_BASE}/${encodeURIComponent(quizId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          title: payload.meta.title,
          questions: payload.questions.map((question) => ({
            id: question.id,
            text: question.text,
            options: question.options.map((option) => option.text),
            correctIndex: Math.max(
              0,
              question.options.findIndex((option) => option.id === question.correctOptionId),
            ),
          })),
        }),
      },
    ).then((res) => mapQuizToDraft(res.quiz)),

  publish: async (quizId: string, _payload: PublishQuizRequestDto = {}) => {
    await apiFetch<{ quiz: { quizId: string } }>(`${QUIZZES_BASE}/${encodeURIComponent(quizId)}/publish`, {
      method: 'POST',
    })
    return quizApi.getDraft(quizId)
  },

  unpublish: (quizId: string) => quizApi.getDraft(quizId),

  listVersions: (_quizId: string) => Promise.resolve([]),
}
