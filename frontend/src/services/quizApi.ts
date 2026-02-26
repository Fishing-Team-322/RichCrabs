import { apiFetch } from './api'
import type {
  CreateQuizRequestDto,
  CreateQuizResponseDto,
  QuizAnswerResultDto,
  QuizQuestionDto,
} from '../types/quiz.types'

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
}
