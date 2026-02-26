export type Team = 'A' | 'B'

export interface Player {
  id: string
  name: string
  team: Team
}

export interface Question {
  id: string
  text: string
  options: string[]
  correctAnswer: number
}

export interface GameState {
  id: string
  pin: string
  phase: 'lobby' | 'playing' | 'finished'
  players: Player[]
  scores: { A: number; B: number }
  turn: Team | null
  currentQuestion: Question | null
  timeLeft: number
  canAnswer: boolean
  isCreator: boolean
}

export interface AnswerResult {
  correct: boolean
  correctAnswer: number
  scores: { A: number; B: number }
}