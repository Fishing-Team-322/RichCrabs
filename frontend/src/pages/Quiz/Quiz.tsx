import { Link, useParams } from 'react-router-dom'
import Lobby from './Lobby'
import Question from './Question'
import Result from './Result'
import { routes } from '../../app/router/routeMap'
import { useGames } from '../../hooks/useGames'
import { useTranslation } from 'react-i18next'
import '../rooms/rooms.css'
import './quiz.css'

const STATUS_LABEL: Record<string, string> = {
  connecting: 'Подключение... ',
  connected: 'Онлайн',
  reconnecting: 'Переподключение...',
  error: 'Ошибка соединения',
  idle: 'Отключено',
}

const QUALITY_LABEL: Record<string, string> = {
  excellent: 'Отличное',
  degraded: 'Стабильное',
  poor: 'Нестабильное',
  offline: 'Оффлайн',
}

const Quiz = () => {
  const { t } = useTranslation()
  const { roomId = '' } = useParams()
  const {
    token,
    gameState,
    answerResult,
    screen,
    questionTimer,
    hasAnswered,
    error,
    connectionState,
    connectionQuality,
    latencyMs,
    playerTeam,
    canStart,
    handleAnswer,
    handleStartGame,
  } = useGames(roomId)

  const connectionLabel = STATUS_LABEL[connectionState]

  if (!token) {
    return (
      <section className="roomsPage">
        <article className="pageCard roomForm">
          <h1>{t('quiz.gameScreen')}</h1>
          <div className="roomError">
            {t('quiz.noSession')} <Link to={routes.join}>join</Link>.
          </div>
        </article>
      </section>
    )
  }

  if (!gameState) {
    return (
      <section className="roomsPage">
        <article className="pageCard roomForm">
          <h1>{t('quiz.connecting')}</h1>
          <p className="roomMeta">{connectionLabel}</p>
          {error && <div className="roomError">{error}</div>}
        </article>
      </section>
    )
  }

  return (
    <section className="roomsPage">
      <div className={`quizConnectionBadge quality-${connectionQuality}`}>
        {t('quiz.connection')}: {QUALITY_LABEL[connectionQuality]}
        {latencyMs !== null && ` · ${latencyMs}мс`}
      </div>

      {error && <div className="roomError">{error}</div>}

      {screen === 'lobby' && (
        <Lobby
          state={gameState}
          canStart={canStart}
          playerTeam={playerTeam}
          connectionLabel={connectionLabel}
          onStart={handleStartGame}
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
