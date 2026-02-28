import type { RoomStateDto } from '../types/room.types'
import type { QuizAnswerResultDto } from '../types/quiz.types'

const DEFAULT_SOCKET_URL = import.meta.env.VITE_WS_URL || `${window.location.origin.replace(/^http/, 'ws')}/ws`
const HEARTBEAT_INTERVAL_MS = 15000
const HEARTBEAT_TIMEOUT_MS = 10000
const RECONNECT_BASE_DELAY_MS = 800
const RECONNECT_MAX_DELAY_MS = 15000

interface SocketConfig {
  token: string
  gameId: string
  wsUrl: string
}

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'
export type ConnectionQuality = 'excellent' | 'degraded' | 'poor' | 'offline'

type SocketEvent =
  | 'hello'
  | 'room_state'
  | 'room_event'
  | 'submit_answer_result'
  | 'start_game_result'
  | 'pause_game_result'
  | 'resume_game_result'
  | 'next_question_result'
  | 'pong'
  | 'error'
  | 'close'

interface SocketEventPayloadMap {
  hello: { roomId: string; role: string }
  room_state: { room_id: string; state: string; players: Array<{ player_id: string; display_name: string; score: number }> }
  room_event: { event: Record<string, unknown> }
  submit_answer_result: { accepted: boolean; score_delta: number }
  start_game_result: { started: boolean }
  pause_game_result: { paused: boolean }
  resume_game_result: { resumed: boolean }
  next_question_result: { advanced: boolean }
  pong: { type: 'pong' }
  error: { error: string; message: string }
  close: CloseEvent
}

export interface ConnectionSnapshot {
  state: ConnectionState
  quality: ConnectionQuality
  latencyMs: number | null
  reason?: string
  error?: string
}

type ConnectionListener = (snapshot: ConnectionSnapshot) => void
type EventListener<K extends SocketEvent> = (payload: SocketEventPayloadMap[K]) => void

export interface QuizSocket {
  on: <K extends SocketEvent>(event: K, listener: EventListener<K>) => void
  off: <K extends SocketEvent>(event: K, listener: EventListener<K>) => void
}

let ws: WebSocket | null = null
let activeConfig: SocketConfig | null = null
let reconnectAttempts = 0
let reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null
let connectionState: ConnectionState = 'idle'
let connectionQuality: ConnectionQuality = 'offline'
let lastLatencyMs: number | null = null
let heartbeatIntervalId: ReturnType<typeof setInterval> | null = null
let heartbeatTimeoutId: ReturnType<typeof setTimeout> | null = null
let heartbeatStartedAt: number | null = null

const connectionListeners = new Set<ConnectionListener>()
const eventListeners: { [K in SocketEvent]: Set<EventListener<K>> } = {
  hello: new Set(),
  room_state: new Set(),
  room_event: new Set(),
  submit_answer_result: new Set(),
  start_game_result: new Set(),
  pause_game_result: new Set(),
  resume_game_result: new Set(),
  next_question_result: new Set(),
  pong: new Set(),
  error: new Set(),
  close: new Set(),
}

const quizSocket: QuizSocket = {
  on: (event, listener) => {
    eventListeners[event].add(listener as never)
  },
  off: (event, listener) => {
    eventListeners[event].delete(listener as never)
  },
}

const emitEvent = <K extends SocketEvent>(event: K, payload: SocketEventPayloadMap[K]) => {
  eventListeners[event].forEach((listener) => {
    listener(payload)
  })
}

const emitConnectionSnapshot = (details?: Pick<ConnectionSnapshot, 'reason' | 'error'>) => {
  const snapshot: ConnectionSnapshot = {
    state: connectionState,
    quality: connectionQuality,
    latencyMs: lastLatencyMs,
    ...details,
  }

  connectionListeners.forEach((listener) => {
    listener(snapshot)
  })
}

const clearHeartbeatTimeout = () => {
  if (heartbeatTimeoutId) {
    clearTimeout(heartbeatTimeoutId)
    heartbeatTimeoutId = null
  }
}

const clearReconnectTimeout = () => {
  if (reconnectTimeoutId) {
    clearTimeout(reconnectTimeoutId)
    reconnectTimeoutId = null
  }
}

const markHeartbeatOk = () => {
  if (heartbeatStartedAt === null) return

  clearHeartbeatTimeout()
  const measuredLatency = Date.now() - heartbeatStartedAt
  heartbeatStartedAt = null
  lastLatencyMs = measuredLatency

  if (measuredLatency < 250) {
    connectionQuality = 'excellent'
  } else if (measuredLatency < 900) {
    connectionQuality = 'degraded'
  } else {
    connectionQuality = 'poor'
  }

  emitConnectionSnapshot()
}

const send = (payload: Record<string, unknown>) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify(payload))
}

const stopHeartbeat = () => {
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId)
    heartbeatIntervalId = null
  }
  clearHeartbeatTimeout()
  heartbeatStartedAt = null
}

const scheduleReconnect = () => {
  if (!activeConfig || reconnectTimeoutId) return

  const backoff = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempts, RECONNECT_MAX_DELAY_MS)
  reconnectAttempts += 1
  reconnectTimeoutId = setTimeout(() => {
    reconnectTimeoutId = null
    if (!activeConfig) return
    connectionState = 'reconnecting'
    connectionQuality = 'poor'
    emitConnectionSnapshot()
    openWebSocket(activeConfig)
  }, backoff)
}

const restartHeartbeat = () => {
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId)
  }

  heartbeatIntervalId = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    heartbeatStartedAt = Date.now()
    send({ type: 'ping' })

    clearHeartbeatTimeout()
    heartbeatTimeoutId = setTimeout(() => {
      connectionState = 'reconnecting'
      connectionQuality = 'poor'
      emitConnectionSnapshot({ error: 'Heartbeat timeout' })
      ws?.close()
    }, HEARTBEAT_TIMEOUT_MS)
  }, HEARTBEAT_INTERVAL_MS)
}

const toWebSocketUrl = (rawUrl: string, token: string) => {
  const source = rawUrl || DEFAULT_SOCKET_URL
  const normalized = source.startsWith('ws://') || source.startsWith('wss://')
    ? source
    : source.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://')
  const url = new URL(normalized, window.location.origin)
  url.searchParams.set('joinTicket', token)
  return url.toString()
}

function openWebSocket(config: SocketConfig) {
  clearReconnectTimeout()
  const url = toWebSocketUrl(config.wsUrl, config.token)
  ws = new WebSocket(url)

  ws.onopen = () => {
    reconnectAttempts = 0
    connectionState = 'connected'
    connectionQuality = 'excellent'
    emitConnectionSnapshot()
    requestGameState()
    restartHeartbeat()
  }

  ws.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as { type?: SocketEvent } & Record<string, unknown>
    const messageType = message.type
    if (!messageType || !(messageType in eventListeners)) return

    if (messageType === 'pong') {
      markHeartbeatOk()
      return
    }

    if (messageType === 'room_state') {
      markHeartbeatOk()
    }

    if (messageType === 'error') {
      emitConnectionSnapshot({ error: String(message.message || message.error || 'Socket error') })
    }

    emitEvent(messageType as SocketEvent, message as never)
  }

  ws.onerror = () => {
    connectionState = 'error'
    connectionQuality = 'offline'
    emitConnectionSnapshot({ error: 'WebSocket transport error' })
  }

  ws.onclose = (event) => {
    stopHeartbeat()
    emitEvent('close', event)

    if (!activeConfig) {
      connectionState = 'idle'
      connectionQuality = 'offline'
      emitConnectionSnapshot({ reason: event.reason || 'Client disconnect' })
      return
    }

    connectionState = 'reconnecting'
    connectionQuality = 'poor'
    emitConnectionSnapshot({ reason: event.reason || `Code ${event.code}` })
    scheduleReconnect()
  }
}

const mapState = (state: SocketEventPayloadMap['room_state']): RoomStateDto => ({
  id: state.room_id,
  pin: state.room_id,
  phase: state.state === 'finished' ? 'finished' : state.state === 'playing' ? 'playing' : 'lobby',
  players: state.players.map((player, index) => ({
    id: player.player_id,
    name: player.display_name,
    team: index % 2 === 0 ? 'A' : 'B',
  })),
  scores: state.players.reduce(
    (acc, player, index) => {
      if (index % 2 === 0) {
        acc.A += player.score
      } else {
        acc.B += player.score
      }
      return acc
    },
    { A: 0, B: 0 },
  ),
  turn: null,
  currentQuestion: null,
  timeLeft: 0,
  canAnswer: state.state === 'playing',
  isCreator: false,
})

export const connectSocket = (token: string, gameId: string, wsUrl?: string): QuizSocket => {
  const nextConfig = { token, gameId, wsUrl: wsUrl || DEFAULT_SOCKET_URL }
  const shouldReuse = activeConfig && activeConfig.token === token && activeConfig.gameId === gameId && activeConfig.wsUrl === nextConfig.wsUrl
  if (shouldReuse && ws) {
    return quizSocket
  }

  disconnectSocket()

  activeConfig = nextConfig
  connectionState = 'connecting'
  connectionQuality = 'degraded'
  emitConnectionSnapshot()
  openWebSocket(nextConfig)

  return quizSocket
}

export const subscribeConnectionEvents = (listener: ConnectionListener) => {
  connectionListeners.add(listener)
  listener({ state: connectionState, quality: connectionQuality, latencyMs: lastLatencyMs })

  return () => {
    connectionListeners.delete(listener)
  }
}

export const getSocket = (): QuizSocket | null => (ws ? quizSocket : null)

export const getConnectionState = (): ConnectionState => connectionState

export const getConnectionQuality = (): ConnectionQuality => connectionQuality

export const requestGameState = () => {
  send({ type: 'get_state' })
}

export const sendStartGame = () => {
  send({ type: 'start_game' })
}

export const sendAnswer = (questionId: string, answer: string) => {
  send({ type: 'submit_answer', question_id: questionId, answer })
}

export const disconnectSocket = () => {
  clearReconnectTimeout()
  stopHeartbeat()

  const activeWs = ws
  ws = null
  activeConfig = null

  if (activeWs) {
    activeWs.onopen = null
    activeWs.onmessage = null
    activeWs.onerror = null
    activeWs.onclose = null
    if (activeWs.readyState === WebSocket.OPEN || activeWs.readyState === WebSocket.CONNECTING) {
      activeWs.close(1000, 'Client disconnect')
    }
  }

  connectionState = 'idle'
  connectionQuality = 'offline'
  lastLatencyMs = null
  emitConnectionSnapshot()
}

export const toRoomStateDto = mapState

export const toAnswerResultDto = (result: SocketEventPayloadMap['submit_answer_result']): QuizAnswerResultDto => ({
  correct: result.accepted,
  correctAnswer: -1,
  scores: { A: Math.max(0, result.score_delta), B: 0 },
})

export const socketService = {
  connect: (token = 'guest', gameId = 'lobby', wsUrl?: string) => connectSocket(token, gameId, wsUrl),
  disconnect: () => disconnectSocket(),
  getSocket: () => getSocket(),
  joinGameRoom: () => requestGameState(),
}
