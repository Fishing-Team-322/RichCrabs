import { useEffect, useMemo, useState } from 'react'
import { useInterval } from './useInterval'
import { playerSession } from '../services/playerSession'
import {
  connectSocket,
  disconnectSocket,
  getConnectionQuality,
  getConnectionState,
  requestGameState,
  sendAnswer,
  sendStartGame,
  subscribeConnectionEvents,
  type ConnectionQuality,
  type ConnectionSnapshot,
} from '../services/socket'
import type { RoomStateDto, Team } from '../types/room.types'
import type { QuizAnswerResultDto } from '../types/quiz.types'

export type QuizScreen = 'lobby' | 'question' | 'feedback' | 'scoreboard' | 'final'

const SCOREBOARD_DELAY_MS = 2500
const FEEDBACK_DELAY_MS = 2500

interface UseGamesState {
  token: string | null
  gameState: RoomStateDto | null
  answerResult: QuizAnswerResultDto | null
  screen: QuizScreen
  questionTimer: number
  hasAnswered: boolean
  error: string
  connectionState: ReturnType<typeof getConnectionState>
  connectionQuality: ConnectionQuality
  latencyMs: number | null
  playerTeam: Team | null
  canStart: boolean
  handleAnswer: (index: number) => void
  handleStartGame: () => void
}

export const useGames = (roomId: string): UseGamesState => {
  const token = playerSession.getToken()
  const playerName = playerSession.getPlayerName()
  const playerId = playerSession.getPlayerId()

  const [gameState, setGameState] = useState<RoomStateDto | null>(null)
  const [answerResult, setAnswerResult] = useState<QuizAnswerResultDto | null>(null)
  const [screen, setScreen] = useState<QuizScreen>('lobby')
  const [questionTimer, setQuestionTimer] = useState(0)
  const [hasAnswered, setHasAnswered] = useState(false)
  const [error, setError] = useState('')
  const [connectionState, setConnectionState] = useState(getConnectionState())
  const [connectionQuality, setConnectionQuality] = useState(getConnectionQuality())
  const [latencyMs, setLatencyMs] = useState<number | null>(null)

  const player = useMemo(() => {
    if (!gameState) {
      return null
    }

    return gameState.players.find((entry) => entry.id === playerId || entry.name === playerName) ?? null
  }, [gameState, playerId, playerName])

  const playerTeam: Team | null = player?.team ?? null

  useInterval(
    () => {
      setQuestionTimer((prev) => (prev > 0 ? prev - 1 : 0))
    },
    screen === 'question' && questionTimer > 0 ? 1000 : null,
  )

  useEffect(() => {
    if (!token || !roomId) {
      return
    }

    const socket = connectSocket(token, roomId)
    const resetTimers = () => {
      setTimeout(() => {
        setScreen((prev) => (prev === 'feedback' ? 'scoreboard' : prev))
      }, FEEDBACK_DELAY_MS)
      setTimeout(() => {
        setScreen((prev) => (prev === 'scoreboard' ? 'question' : prev))
      }, FEEDBACK_DELAY_MS + SCOREBOARD_DELAY_MS)
    }

    const updateByGameState = (state: RoomStateDto) => {
      setGameState(state)
      setQuestionTimer(state.timeLeft)

      if (state.phase === 'finished') {
        setScreen('final')
        return
      }

      if (state.phase === 'lobby') {
        setScreen('lobby')
        return
      }

      if (state.currentQuestion) {
        setScreen('question')
      }
    }

    const onGameState = (state: RoomStateDto) => {
      setError('')
      updateByGameState(state)
      setHasAnswered(false)
    }

    const onReconnectState = (state: RoomStateDto) => {
      setError('Состояние восстановлено после переподключения.')
      updateByGameState(state)
      setHasAnswered(!state.canAnswer)
    }

    const onAnswerResult = (result: QuizAnswerResultDto) => {
      setAnswerResult(result)
      setScreen('feedback')
      resetTimers()
    }

    const onConnectionEvent = (snapshot: ConnectionSnapshot) => {
      setConnectionState(snapshot.state)
      setConnectionQuality(snapshot.quality)
      setLatencyMs(snapshot.latencyMs)

      if (snapshot.state === 'reconnecting') {
        setError('Соединение потеряно, пытаемся переподключиться...')
      }

      if (snapshot.state === 'error') {
        setError('Проблема с websocket соединением.')
      }

      if (snapshot.state === 'connected') {
        requestGameState()
      }
    }

    socket.off('gameState', onGameState)
    socket.off('reconnectState', onReconnectState)
    socket.off('answerResult', onAnswerResult)

    socket.on('gameState', onGameState)
    socket.on('reconnectState', onReconnectState)
    socket.on('answerResult', onAnswerResult)

    const unsubscribeConnection = subscribeConnectionEvents(onConnectionEvent)

    requestGameState()

    return () => {
      socket.off('gameState', onGameState)
      socket.off('reconnectState', onReconnectState)
      socket.off('answerResult', onAnswerResult)
      unsubscribeConnection()
      disconnectSocket()
    }
  }, [roomId, token])

  const handleAnswer = (index: number) => {
    if (!gameState || hasAnswered || !gameState.canAnswer) {
      return
    }

    setHasAnswered(true)
    sendAnswer(index)
  }

  return {
    token,
    gameState,
    answerResult,
    screen,
    questionTimer,
    hasAnswered,
    error,
    connectionState,
    connectionQuality,
    latencyMs,
    playerTeam,
    canStart: Boolean(gameState?.isCreator),
    handleAnswer,
    handleStartGame: () => sendStartGame(),
  }
}
