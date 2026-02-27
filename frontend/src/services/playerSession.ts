const PLAYER_TOKEN_KEY = 'player_token'
const PLAYER_NAME_KEY = 'player_name'
const PLAYER_ID_KEY = 'player_id'

export const playerSession = {
  saveToken: (token: string) => {
    sessionStorage.setItem(PLAYER_TOKEN_KEY, token)
  },
  getToken: () => sessionStorage.getItem(PLAYER_TOKEN_KEY) || '',
  clearToken: () => sessionStorage.removeItem(PLAYER_TOKEN_KEY),
  savePlayerName: (name: string) => {
    sessionStorage.setItem(PLAYER_NAME_KEY, name)
  },
  getPlayerName: () => sessionStorage.getItem(PLAYER_NAME_KEY) || '',
  savePlayerId: (playerId: string) => {
    sessionStorage.setItem(PLAYER_ID_KEY, playerId)
  },
  getPlayerId: () => sessionStorage.getItem(PLAYER_ID_KEY) || '',
}
