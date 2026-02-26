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
