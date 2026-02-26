import { io, Socket } from 'socket.io-client'
import { RoomStateDto } from '../types/room.types'

const SOCKET_URL = import.meta.env.VITE_WS_URL || 'http://localhost:5000'

let socket: Socket | null = null

export const connectSocket = (token: string, gameId: string): Socket => {
  if (socket) socket.disconnect()
  socket = io(SOCKET_URL, {
    query: { token, gameId },
  })
  return socket
}

export const getSocket = (): Socket | null => socket

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

export interface ServerToClientEvents {
  gameState: (state: RoomStateDto) => void
  answerResult: (result: unknown) => void
}

export interface ClientToServerEvents {
  startGame: () => void
  answer: (data: { answer: number }) => void
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

    activeSocket.emit('join-game', { pin, playerId })
  },
}
