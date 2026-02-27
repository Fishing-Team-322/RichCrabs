import { io, Socket } from 'socket.io-client'
import type { RoomStateDto } from '../types/room.types'
import type { QuizAnswerResultDto } from '../types/quiz.types'

const SOCKET_URL = import.meta.env.VITE_WS_URL || 'http://localhost:5000'

interface SocketConfig {
  token: string
  gameId: string
}

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

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

let socket: QuizSocket | null = null
let activeConfig: SocketConfig | null = null
let connectionState: ConnectionState = 'idle'

const configureLifecycle = (client: QuizSocket) => {
  client.on('connect', () => {
    connectionState = 'connected'
    client.emit('getGameState')
  })

  client.on('reconnect_attempt', () => {
    connectionState = 'reconnecting'
  })

  client.on('reconnect', () => {
    connectionState = 'connected'
    client.emit('getGameState')
  })

  client.on('connect_error', () => {
    connectionState = 'error'
  })

  client.on('disconnect', (reason) => {
    connectionState = reason === 'io client disconnect' ? 'idle' : 'reconnecting'
  })
}

export const connectSocket = (token: string, gameId: string): QuizSocket => {
  const shouldReuse = socket && activeConfig?.token === token && activeConfig?.gameId === gameId
  if (shouldReuse) {
    return socket
  }

  if (socket) {
    socket.disconnect()
  }

  activeConfig = { token, gameId }
  connectionState = 'connecting'
  socket = io(SOCKET_URL, {
    transports: ['websocket'],
    auth: { token, gameId },
    query: { token, gameId },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  })

  configureLifecycle(socket)
  return socket
}

export const getSocket = (): QuizSocket | null => socket

export const getConnectionState = (): ConnectionState => connectionState

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
  if (socket) {
    socket.disconnect()
    socket = null
  }
  activeConfig = null
  connectionState = 'idle'
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
