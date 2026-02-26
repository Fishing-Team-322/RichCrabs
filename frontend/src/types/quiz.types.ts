export interface CreateQuizRequestDto {
  topic: string
  questionCount: number
}

export interface CreateQuizResponseDto {
  creatorToken: string
  gameId: string
  pin: string
}

export interface QuizQuestionDto {
  id: string
  text: string
  options: string[]
  correctAnswer: number
}

export interface QuizAnswerResultDto {
  correct: boolean
  correctAnswer: number
  scores: { A: number; B: number }
}

export type QuizStatus = 'draft' | 'published' | 'archived'
export type QuizDifficulty = 'easy' | 'medium' | 'hard'

export interface QuizEditorOptionDto {
  id: string
  text: string
}

export interface QuizEditorQuestionDto {
  id: string
  text: string
  options: QuizEditorOptionDto[]
  correctOptionId: string
  timeLimitSec: number
  difficulty: QuizDifficulty
}

export interface QuizMetaDto {
  title: string
  language: string
  tags: string[]
  coverUrl: string
}

export interface QuizDraftDto {
  id: string
  meta: QuizMetaDto
  questions: QuizEditorQuestionDto[]
  status: QuizStatus
  version: number
  updatedAt: string
}

export interface SaveQuizDraftRequestDto {
  meta: QuizMetaDto
  questions: QuizEditorQuestionDto[]
}

export interface PublishQuizRequestDto {
  version?: number
}

export interface QuizListItemDto {
  id: string
  title: string
  language: string
  tags: string[]
  status: QuizStatus
  updatedAt: string
  questionsCount: number
}

export interface QuizListParams {
  status?: QuizStatus
  search?: string
}
