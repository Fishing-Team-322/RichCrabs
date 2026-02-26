import { apiFetch } from './api'
import {
  CreateGameRequest,
  CreateGameResponse,
  JoinGameRequest,
  JoinGameResponse,
} from '../types/apiTypes.ts'

export const gameApi = {
  create: (data: CreateGameRequest) =>
    apiFetch<CreateGameResponse>('/api/games/create', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  join: (data: JoinGameRequest) =>
    apiFetch<JoinGameResponse>('/api/games/join', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getOpenGames: () => apiFetch<any[]>('/api/games/open'),
}