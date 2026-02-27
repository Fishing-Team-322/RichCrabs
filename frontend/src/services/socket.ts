import { io, Socket } from 'socket.io-client'
import type { RoomStateDto } from '../types/room.types'
import type { QuizAnswerResultDto } from '../types/quiz.types'

const SOCKET_URL = import.meta.env.VITE_WS_URL || 'http://localhost:5000'
const HEARTBEAT_INTERVAL_MS = 15000
const HEARTBEAT_TIMEOUT_MS = 10000

interface SocketConfig {
  token: string
  gameId: string
}

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'
export type ConnectionQuality = 'excellent' | 'degraded' | 'poor' | 'offline'

export interface ConnectionSnapshot {
  state: ConnectionState
  quality: ConnectionQuality
  latencyMs: number | null
  reason?: string
  error?: string
}

export interface ServerToClientEvents {
  gameState: (state: RoomStateDto) => void
  answerResult: (result: QuizAnswerResultDto) => void
  reconnectState: (state: RoomStateDto) => void
  connect_error: (error: Error) => void
  disconnect: (reason: string) => void
}

export interface ClientToServerEvents {
  startGame: () => void
  answer: (data: { answer: number }) => void
  getGameState: () => void
}

type QuizSocket = Socket<ServerToClientEvents, ClientToServerEvents>
type ConnectionListener = (snapshot: ConnectionSnapshot) => void

let socket: QuizSocket | null = null
let activeConfig: SocketConfig | null = null
let connectionState: ConnectionState = 'idle'
let connectionQuality: ConnectionQuality = 'offline'
let lastLatencyMs: number | null = null
let heartbeatIntervalId: ReturnType<typeof setInterval> | null = null
let heartbeatTimeoutId: ReturnType<typeof setTimeout> | null = null
let heartbeatStartedAt: number | null = null
const connectionListeners = new Set<ConnectionListener>()

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

const markHeartbeatOk = () => {
  if (heartbeatStartedAt === null) {
    return
  }

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

const restartHeartbeat = (client: QuizSocket) => {
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId)
  }

  heartbeatIntervalId = setInterval(() => {
    if (!client.connected) {
      return
    }

    heartbeatStartedAt = Date.now()
    client.emit('getGameState')

    clearHeartbeatTimeout()
    heartbeatTimeoutId = setTimeout(() => {
      connectionState = 'reconnecting'
      connectionQuality = 'poor'
      emitConnectionSnapshot({ error: 'Heartbeat timeout' })
      client.disconnect()
      client.connect()
    }, HEARTBEAT_TIMEOUT_MS)
  }, HEARTBEAT_INTERVAL_MS)
}

const stopHeartbeat = () => {
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId)
    heartbeatIntervalId = null
  }

  clearHeartbeatTimeout()
  heartbeatStartedAt = null
}

const configureLifecycle = (client: QuizSocket) => {
  client.off('connect')
  client.on('connect', () => {
    connectionState = 'connected'
    connectionQuality = 'excellent'
    emitConnectionSnapshot()
    client.emit('getGameState')
    restartHeartbeat(client)
  })

  client.io.off('reconnect_attempt')
  client.io.on('reconnect_attempt', () => {
    connectionState = 'reconnecting'
    connectionQuality = 'poor'
    emitConnectionSnapshot()
  })

  client.io.off('reconnect')
  client.io.on('reconnect', () => {
    connectionState = 'connected'
    connectionQuality = 'degraded'
    emitConnectionSnapshot()
    client.emit('getGameState')
  })

  client.off('connect_error')
  client.on('connect_error', (error) => {
    connectionState = 'error'
    connectionQuality = 'offline'
    emitConnectionSnapshot({ error: error.message })
  })

  client.off('disconnect')
  client.on('disconnect', (reason) => {
    stopHeartbeat()
    connectionState = reason === 'io client disconnect' ? 'idle' : 'reconnecting'
    connectionQuality = reason === 'io client disconnect' ? 'offline' : 'poor'
    emitConnectionSnapshot({ reason })
  })

  client.off('gameState', markHeartbeatOk)
  client.off('reconnectState', markHeartbeatOk)
  client.off('answerResult', markHeartbeatOk)
  client.on('gameState', markHeartbeatOk)
  client.on('reconnectState', markHeartbeatOk)
  client.on('answerResult', markHeartbeatOk)
}

export const connectSocket = (token: string, gameId: string): QuizSocket => {
  const shouldReuse = socket && activeConfig?.token === token && activeConfig?.gameId === gameId
  if (shouldReuse && socket) {
    return socket
  }

  if (socket) {
    socket.disconnect()
  }

  activeConfig = { token, gameId }
  connectionState = 'connecting'
  connectionQuality = 'degraded'
  emitConnectionSnapshot()
  socket = io(SOCKET_URL, {
    transports: ['websocket'],
    auth: { token, gameId },
    query: { token, gameId },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 15000,
    randomizationFactor: 0.5,
    timeout: 10000,
  })

  configureLifecycle(socket)
  return socket
}

export const subscribeConnectionEvents = (listener: ConnectionListener) => {
  connectionListeners.add(listener)
  listener({ state: connectionState, quality: connectionQuality, latencyMs: lastLatencyMs })

  return () => {
    connectionListeners.delete(listener)
  }
}

export const getSocket = (): QuizSocket | null => socket

export const getConnectionState = (): ConnectionState => connectionState

export const getConnectionQuality = (): ConnectionQuality => connectionQuality

export const requestGameState = () => {
  socket?.emit('getGameState')
}

export const sendStartGame = () => {
  socket?.emit('startGame')
}

export const sendAnswer = (answer: number) => {
  socket?.emit('answer', { answer })
}

export const disconnectSocket = () => {
  stopHeartbeat()
  if (socket) {
    socket.disconnect()
    socket = null
  }
  activeConfig = null
  connectionState = 'idle'
  connectionQuality = 'offline'
  lastLatencyMs = null
  emitConnectionSnapshot()
}

/**
 * Backward-compatible service API used by legacy hooks (useSockets.ts).
 */
export const socketService = {
  connect: (token = 'guest', gameId = 'lobby') => connectSocket(token, gameId),
  disconnect: () => disconnectSocket(),
  getSocket: () => getSocket(),
  joinGameRoom: (pin: string, playerId: string) => {
    const activeSocket = getSocket()
    if (!activeSocket) {
      return
    }

    ;(activeSocket as Socket).emit('join-game', { pin, playerId })
  },
}
