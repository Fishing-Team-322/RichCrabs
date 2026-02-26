import { io, Socket } from 'socket.io-client'
import { GameState } from '../types/gameTypes'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000'

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
  gameState: (state: GameState) => void
  answerResult: (result: any) => void
}

export interface ClientToServerEvents {
  startGame: () => void
  answer: (data: { answer: number }) => void
}