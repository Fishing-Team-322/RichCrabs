import { joinApi } from './joinApi'
import { quizApi } from './quizApi'
import { roomsApi } from './roomsApi'

export const gameApi = {
  create: quizApi.create,
  join: joinApi.joinRoom,
  getOpenGames: roomsApi.getOpenRooms,
}
