import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Lobby from './Lobby'
import Question from './Question'
import Result from './Result'
import { routes } from '../../app/router/routeMap'
import { useInterval } from '../../hooks/useInterval'
import { playerSession } from '../../services/playerSession'
import {
  connectSocket,
  disconnectSocket,
  getConnectionState,
  requestGameState,
  sendAnswer,
  sendStartGame,
} from '../../services/socket'
import type { RoomStateDto, Team } from '../../types/room.types'
import type { QuizAnswerResultDto } from '../../types/quiz.types'
import '../rooms/rooms.css'
import './quiz.css'

type QuizScreen = 'lobby' | 'question' | 'feedback' | 'scoreboard' | 'final'

const STATUS_LABEL: Record<string, string> = {
  connecting: 'Подключение... ',
  connected: 'Онлайн',
  reconnecting: 'Переподключение...',
  error: 'Ошибка соединения',
  idle: 'Отключено',
}

const SCOREBOARD_DELAY_MS = 2500
const FEEDBACK_DELAY_MS = 2500

const Quiz = () => {
  const { roomId = '' } = useParams()
  const token = playerSession.getToken()
  const playerName = playerSession.getPlayerName()
  const playerId = playerSession.getPlayerId()

  const [gameState, setGameState] = useState<RoomStateDto | null>(null)
  const [answerResult, setAnswerResult] = useState<QuizAnswerResultDto | null>(null)
  const [screen, setScreen] = useState<QuizScreen>('lobby')
  const [questionTimer, setQuestionTimer] = useState(0)
  const [hasAnswered, setHasAnswered] = useState(false)
  const [connectionLabel, setConnectionLabel] = useState(STATUS_LABEL[getConnectionState()])
  const [error, setError] = useState('')

  const player = useMemo(() => {
    if (!gameState) {
      return null
    }

    return gameState.players.find((entry) => entry.id === playerId || entry.name === playerName) ?? null
  }, [gameState, playerId, playerName])

  const playerTeam: Team | null = player?.team ?? null

  useInterval(
    () => {
      setQuestionTimer((prev) => (prev > 0 ? prev - 1 : 0))
    },
    screen === 'question' && questionTimer > 0 ? 1000 : null,
  )

  useEffect(() => {
    if (!token || !roomId) {
      return
    }

    const socket = connectSocket(token, roomId)

    const updateByGameState = (state: RoomStateDto) => {
      setGameState(state)
      setQuestionTimer(state.timeLeft)

      if (state.phase === 'finished') {
        setScreen('final')
        return
      }

      if (state.phase === 'lobby') {
        setScreen('lobby')
        return
      }

      if (state.currentQuestion) {
        setScreen('question')
      }
    }

    const onGameState = (state: RoomStateDto) => {
      setError('')
      updateByGameState(state)
      setHasAnswered(false)
    }

    const onReconnectState = (state: RoomStateDto) => {
      setError('Состояние восстановлено после переподключения.')
      updateByGameState(state)
      setHasAnswered(!state.canAnswer)
    }

    const onAnswerResult = (result: QuizAnswerResultDto) => {
      setAnswerResult(result)
      setScreen('feedback')
      setTimeout(() => {
        setScreen((prev) => (prev === 'feedback' ? 'scoreboard' : prev))
      }, FEEDBACK_DELAY_MS)
      setTimeout(() => {
        setScreen((prev) => (prev === 'scoreboard' ? 'question' : prev))
      }, FEEDBACK_DELAY_MS + SCOREBOARD_DELAY_MS)
    }

    const syncConnectionLabel = () => {
      setConnectionLabel(STATUS_LABEL[getConnectionState()])
    }

    const onDisconnect = () => {
      syncConnectionLabel()
      setError('Соединение потеряно, пытаемся переподключиться...')
    }

    const onConnectError = () => {
      syncConnectionLabel()
      setError('Проблема с websocket соединением.')
    }

    socket.on('gameState', onGameState)
    socket.on('reconnectState', onReconnectState)
    socket.on('answerResult', onAnswerResult)
    socket.on('disconnect', onDisconnect)
    socket.on('connect', syncConnectionLabel)
    socket.on('reconnect', syncConnectionLabel)
    socket.on('connect_error', onConnectError)

    requestGameState()

    return () => {
      socket.off('gameState', onGameState)
      socket.off('reconnectState', onReconnectState)
      socket.off('answerResult', onAnswerResult)
      socket.off('disconnect', onDisconnect)
      socket.off('connect', syncConnectionLabel)
      socket.off('reconnect', syncConnectionLabel)
      socket.off('connect_error', onConnectError)
      disconnectSocket()
    }
  }, [roomId, token])

  const handleAnswer = (index: number) => {
    if (!gameState || hasAnswered || !gameState.canAnswer) {
      return
    }

    setHasAnswered(true)
    sendAnswer(index)
  }

  const canStart = Boolean(gameState?.isCreator)

  if (!token) {
    return (
      <section className="roomsPage">
        <article className="pageCard roomForm">
          <h1>Игровой экран</h1>
          <div className="roomError">
            Сессия игрока не найдена. Выполните вход через <Link to={routes.join}>страницу join</Link>.
          </div>
        </article>
      </section>
    )
  }

  if (!gameState) {
    return (
      <section className="roomsPage">
        <article className="pageCard roomForm">
          <h1>Подключаемся к игре...</h1>
          <p className="roomMeta">{connectionLabel}</p>
          {error && <div className="roomError">{error}</div>}
        </article>
      </section>
    )
  }

  return (
    <section className="roomsPage">
      {error && <div className="roomError">{error}</div>}

      {screen === 'lobby' && (
        <Lobby
          state={gameState}
          canStart={canStart}
          playerTeam={playerTeam}
          connectionLabel={connectionLabel}
          onStart={() => sendStartGame()}
        />
      )}

      {screen === 'question' && gameState.currentQuestion && (
        <Question
          question={gameState.currentQuestion}
          scores={gameState.scores}
          activeTurn={gameState.turn}
          playerTeam={playerTeam}
          timerSec={questionTimer}
          hasAnswered={hasAnswered}
          canAnswer={gameState.canAnswer}
          onAnswer={handleAnswer}
        />
      )}

      {screen === 'feedback' && (
        <Result mode="feedback" answerResult={answerResult} scores={gameState.scores} players={gameState.players} />
      )}

      {screen === 'scoreboard' && <Result mode="scoreboard" scores={gameState.scores} players={gameState.players} />}

      {screen === 'final' && <Result mode="final" scores={gameState.scores} players={gameState.players} />}
    </section>
  )
}

export default Quiz
