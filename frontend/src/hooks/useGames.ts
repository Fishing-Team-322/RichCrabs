import { useEffect, useMemo, useState } from 'react'
import { useInterval } from './useInterval'
import { playerSession } from '../services/playerSession'
import {
  connectSocket,
  disconnectSocket,
  getConnectionQuality,
  getConnectionState,
  requestChatHistory,
  requestGameState,
  sendAnswer,
  sendChatMessage,
  sendStartGame,
  subscribeConnectionEvents,
  toAnswerResultDto,
  toRoomStateDto,
  type ConnectionQuality,
  type ConnectionSnapshot,
} from '../services/socket'
import type { RoomStateDto, Team } from '../types/room.types'
import type { QuizAnswerResultDto, QuizQuestionDto } from '../types/quiz.types'

export interface ChatMessageDto {
  id: string
  author: string
  body: string
  createdAt: string
}

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
  chatMessages: ChatMessageDto[]
  sendChat: (body: string) => void
  handleAnswer: (index: number) => void
  handleStartGame: () => void
}

const mapChatMessage = (payload: { message_id: string; author: string; body: string; created_at?: { seconds?: string | number } | null }): ChatMessageDto => ({
  id: payload.message_id,
  author: payload.author || 'unknown',
  body: payload.body,
  createdAt: payload.created_at?.seconds ? new Date(Number(payload.created_at.seconds) * 1000).toISOString() : new Date().toISOString(),
})

export const useGames = (roomId: string): UseGamesState => {
  const token = playerSession.getToken()
  const wsUrl = playerSession.getWsUrl()
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
  const [chatMessages, setChatMessages] = useState<ChatMessageDto[]>([])

  const player = useMemo(() => {
    if (!gameState) return null
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
    if (!token || !roomId) return

    const socket = connectSocket(token, roomId, wsUrl)
    const resetTimers = () => {
      setTimeout(() => setScreen((prev) => (prev === 'feedback' ? 'scoreboard' : prev)), FEEDBACK_DELAY_MS)
      setTimeout(() => setScreen((prev) => (prev === 'scoreboard' ? 'question' : prev)), FEEDBACK_DELAY_MS + SCOREBOARD_DELAY_MS)
    }

    const onRoomState = (statePayload: { room_id: string; state: string; players: Array<{ player_id: string; display_name: string; score: number }> }) => {
      const state = toRoomStateDto(statePayload)
      setError('')
      setGameState(state)
      setQuestionTimer(state.timeLeft)
      setHasAnswered(false)

      if (state.phase === 'finished') {
        setScreen('final')
      } else if (state.phase === 'lobby') {
        setScreen('lobby')
      } else if (state.currentQuestion) {
        setScreen('question')
      }
    }

    const onRoomEvent = (_payload: { event: Record<string, unknown> }) => {
      requestGameState()
    }

    const onSubmitAnswerResult = (payload: { accepted: boolean; score_delta: number }) => {
      setAnswerResult(toAnswerResultDto(payload))
      setScreen('feedback')
      resetTimers()
    }

    const onChatHistory = (payload: { messages: Array<{ message_id: string; author: string; body: string; created_at?: { seconds?: string | number } | null }> }) => {
      setChatMessages(payload.messages.map(mapChatMessage))
    }

    const onChatMessage = (payload: { message_id: string; author: string; body: string; created_at?: { seconds?: string | number } | null }) => {
      setChatMessages((prev) => [...prev, mapChatMessage(payload)].slice(-100))
    }

    const onConnectionEvent = (snapshot: ConnectionSnapshot) => {
      setConnectionState(snapshot.state)
      setConnectionQuality(snapshot.quality)
      setLatencyMs(snapshot.latencyMs)

      if (snapshot.state === 'reconnecting') setError('Соединение потеряно, пытаемся переподключиться...')
      if (snapshot.state === 'error') setError('Проблема с websocket соединением.')
      if (snapshot.state === 'connected') {
        requestGameState()
        requestChatHistory()
      }
    }

    socket.off('room_state', onRoomState)
    socket.off('room_event', onRoomEvent)
    socket.off('submit_answer_result', onSubmitAnswerResult)
    socket.off('chat_history', onChatHistory)
    socket.off('chat_message', onChatMessage)

    socket.on('room_state', onRoomState)
    socket.on('room_event', onRoomEvent)
    socket.on('submit_answer_result', onSubmitAnswerResult)
    socket.on('chat_history', onChatHistory)
    socket.on('chat_message', onChatMessage)

    const unsubscribeConnection = subscribeConnectionEvents(onConnectionEvent)
    requestGameState()
    requestChatHistory()

    return () => {
      socket.off('room_state', onRoomState)
      socket.off('room_event', onRoomEvent)
      socket.off('submit_answer_result', onSubmitAnswerResult)
      socket.off('chat_history', onChatHistory)
      socket.off('chat_message', onChatMessage)
      unsubscribeConnection()
      disconnectSocket()
    }
  }, [roomId, token, wsUrl])

  const handleAnswer = (index: number) => {
    if (!gameState || hasAnswered || !gameState.canAnswer) return
    setHasAnswered(true)
    const questionId = (gameState.currentQuestion as QuizQuestionDto | null)?.id ?? ''
    sendAnswer(questionId, String(index))
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
    chatMessages,
    sendChat: (body: string) => sendChatMessage(body),
    handleAnswer,
    handleStartGame: () => sendStartGame(),
  }
}
