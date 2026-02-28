import { useEffect } from 'react'
import { connectSocket, disconnectSocket, getSocket, requestGameState, subscribeConnectionEvents, toRoomStateDto, type QuizSocket } from '../services/socket'
import { useAppDispatch } from '../store/hooks'
import {
  setPlayers,
  setScores,
  setStatus,
} from '../store/slices/gameSessionSlice'

export const useGameSocket = (pin: string, playerId: string) => {
  const dispatch = useAppDispatch()

  useEffect(() => {
    if (!getSocket()) {
      connectSocket('guest', pin)
    }

    const socket = getSocket() as QuizSocket | null
    if (!socket) {
      return
    }

    const onRoomState = (payload: { room_id: string; state: string; players: Array<{ player_id: string; display_name: string; score: number }> }) => {
      const state = toRoomStateDto(payload)
      dispatch(setPlayers(state.players.map((player) => ({ id: player.id, name: player.name, team: player.team }))))
      dispatch(setScores({ teamA: state.scores.A, teamB: state.scores.B }))
      dispatch(setStatus(state.phase === 'playing' ? 'playing' : state.phase === 'finished' ? 'finished' : 'waiting'))
    }

    socket.off('room_state', onRoomState)
    socket.on('room_state', onRoomState)

    const unsubscribeConnection = subscribeConnectionEvents((snapshot) => {
      if (snapshot.state === 'connected') {
        requestGameState()
      }

      if (snapshot.state === 'reconnecting' || snapshot.state === 'error') {
        dispatch(setStatus('waiting'))
      }
    })

    requestGameState()

    return () => {
      socket.off('room_state', onRoomState)
      unsubscribeConnection()
      disconnectSocket()
    }
  }, [pin, playerId, dispatch])
}
