import { useEffect } from 'react'
import { connectSocket, disconnectSocket, getSocket, requestGameState, subscribeConnectionEvents } from '../services/socket'
import { useAppDispatch } from '../store/hooks'
import {
  setPlayers,
  setTeams,
  setCurrentQuestion,
  setTimeLeft,
  setScores,
  setStatus,
  setMyTeamTurn,
} from '../store/slices/gameSessionSlice'

export const useGameSocket = (pin: string, playerId: string) => {
  const dispatch = useAppDispatch()

  useEffect(() => {
    if (!getSocket()) {
      connectSocket('guest', pin)
    }

    const socket = getSocket()
    if (!socket) {
      return
    }

    socket.emit('join-game', { pin, playerId })

    const onPlayersUpdate = (data: { players: any[]; teamA: any[]; teamB: any[] }) => {
      dispatch(setPlayers(data.players))
      dispatch(setTeams({ teamA: data.teamA, teamB: data.teamB }))
    }

    const onGameStarted = () => {
      dispatch(setStatus('playing'))
    }

    const onQuestion = (data: { question: any; timeLimit: number }) => {
      dispatch(setCurrentQuestion(data.question))
      dispatch(setTimeLeft(data.timeLimit))
    }

    const onTurn = (data: { team: 'A' | 'B' }) => {
      dispatch(setMyTeamTurn(data.team === 'A'))
    }

    const onScoreUpdate = (data: { teamA: number; teamB: number }) => {
      dispatch(setScores({ teamA: data.teamA, teamB: data.teamB }))
    }

    const onTimeUpdate = (data: { timeLeft: number }) => {
      dispatch(setTimeLeft(data.timeLeft))
    }

    const onGameFinished = (_data: { winner: 'A' | 'B' | 'draw' }) => {
      dispatch(setStatus('finished'))
    }

    const onConnection = () => {
      requestGameState()
    }

    const onReconnect = () => {
      dispatch(setStatus('waiting'))
    }

    socket.off('players-update', onPlayersUpdate)
    socket.off('game-started', onGameStarted)
    socket.off('question', onQuestion)
    socket.off('turn', onTurn)
    socket.off('score-update', onScoreUpdate)
    socket.off('time-update', onTimeUpdate)
    socket.off('game-finished', onGameFinished)

    socket.on('players-update', onPlayersUpdate)
    socket.on('game-started', onGameStarted)
    socket.on('question', onQuestion)
    socket.on('turn', onTurn)
    socket.on('score-update', onScoreUpdate)
    socket.on('time-update', onTimeUpdate)
    socket.on('game-finished', onGameFinished)

    const unsubscribeConnection = subscribeConnectionEvents((snapshot) => {
      if (snapshot.state === 'connected') {
        onConnection()
      }

      if (snapshot.state === 'reconnecting' || snapshot.state === 'error') {
        onReconnect()
      }
    })

    return () => {
      socket.off('players-update', onPlayersUpdate)
      socket.off('game-started', onGameStarted)
      socket.off('question', onQuestion)
      socket.off('turn', onTurn)
      socket.off('score-update', onScoreUpdate)
      socket.off('time-update', onTimeUpdate)
      socket.off('game-finished', onGameFinished)
      unsubscribeConnection()
      disconnectSocket()
    }
  }, [pin, playerId, dispatch])
}
