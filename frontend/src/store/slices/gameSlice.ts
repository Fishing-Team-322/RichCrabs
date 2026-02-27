import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { GameDto, PlayerDto } from '../../types/room.types'
import { QuizQuestionDto } from '../../types/quiz.types'

interface GameState {
  currentGame: GameDto | null
  pin: string | null
  players: PlayerDto[]
  teamA: PlayerDto[]
  teamB: PlayerDto[]
  currentQuestion: QuizQuestionDto | null
  timeLeft: number
  scoreA: number
  scoreB: number
  status: 'waiting' | 'playing' | 'finished'
  isMyTeamTurn: boolean
}

const initialState: GameState = {
  currentGame: null,
  pin: null,
  players: [],
  teamA: [],
  teamB: [],
  currentQuestion: null,
  timeLeft: 0,
  scoreA: 0,
  scoreB: 0,
  status: 'waiting',
  isMyTeamTurn: false,
}

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    setGame: (state, action: PayloadAction<GameDto>) => {
      state.currentGame = action.payload
    },
    setPin: (state, action: PayloadAction<string>) => {
      state.pin = action.payload
    },
    setPlayers: (state, action: PayloadAction<PlayerDto[]>) => {
      state.players = action.payload
    },
    setTeams: (state, action: PayloadAction<{ teamA: PlayerDto[]; teamB: PlayerDto[] }>) => {
      state.teamA = action.payload.teamA
      state.teamB = action.payload.teamB
    },
    setCurrentQuestion: (state, action: PayloadAction<QuizQuestionDto>) => {
      state.currentQuestion = action.payload
    },
    setTimeLeft: (state, action: PayloadAction<number>) => {
      state.timeLeft = action.payload
    },
    updateScore: (state, action: PayloadAction<{ team: 'A' | 'B'; points: number }>) => {
      if (action.payload.team === 'A') state.scoreA += action.payload.points
      else state.scoreB += action.payload.points
    },
    setStatus: (state, action: PayloadAction<'waiting' | 'playing' | 'finished'>) => {
      state.status = action.payload
    },
    setMyTeamTurn: (state, action: PayloadAction<boolean>) => {
      state.isMyTeamTurn = action.payload
    },
    resetGame: () => initialState,
  },
})

export const {
  setGame,
  setPin,
  setPlayers,
  setTeams,
  setCurrentQuestion,
  setTimeLeft,
  updateScore,
  setStatus,
  setMyTeamTurn,
  resetGame,
} = gameSlice.actions
export default gameSlice.reducer
