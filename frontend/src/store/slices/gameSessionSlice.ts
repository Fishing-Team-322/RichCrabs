import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { GameDto, PlayerDto } from '../../types/room.types'
import type { QuizQuestionDto } from '../../types/quiz.types'
import type { RootState } from '../store'

interface GameSessionState {
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

const initialState: GameSessionState = {
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

const gameSessionSlice = createSlice({
  name: 'gameSession',
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
    setScores: (state, action: PayloadAction<{ teamA: number; teamB: number }>) => {
      state.scoreA = action.payload.teamA
      state.scoreB = action.payload.teamB
    },
    setStatus: (state, action: PayloadAction<'waiting' | 'playing' | 'finished'>) => {
      state.status = action.payload
    },
    setMyTeamTurn: (state, action: PayloadAction<boolean>) => {
      state.isMyTeamTurn = action.payload
    },
    resetGameSession: () => initialState,
  },
})

export const selectGameSession = (state: RootState) => state.gameSession

export const {
  setGame,
  setPin,
  setPlayers,
  setTeams,
  setCurrentQuestion,
  setTimeLeft,
  setScores,
  setStatus,
  setMyTeamTurn,
  resetGameSession,
} = gameSessionSlice.actions

export default gameSessionSlice.reducer
