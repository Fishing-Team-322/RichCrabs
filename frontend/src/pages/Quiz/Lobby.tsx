import type { RoomStateDto, Team } from '../../types/room.types'
import { useTranslation } from 'react-i18next'

interface LobbyProps {
  state: RoomStateDto
  canStart: boolean
  playerTeam: Team | null
  onStart: () => void
  connectionLabel: string
}

const Lobby = ({ state, canStart, playerTeam, onStart, connectionLabel }: LobbyProps) => {
  const { t } = useTranslation()

  return <article className="pageCard quizRuntimeCard">
    <div className="quizRuntimeHeader">
      <h2>{t('quiz.lobby', { pin: state.pin })}</h2>
      <span className="quizConnectionState" role="status" aria-live="polite">{connectionLabel}</span>
    </div>

    <p className="roomMeta">{t('quiz.waiting', { team: playerTeam ?? '—' })}</p>

    <div className="quizTeamsGrid">
      <section className="quizTeamBlock teamA">
        <h3>Команда A · {state.scores.A} очков</h3>
        <ul>
          {state.players
            .filter((player) => player.team === 'A')
            .map((player) => (
              <li key={player.id}>{player.name}</li>
            ))}
        </ul>
      </section>

      <section className="quizTeamBlock teamB">
        <h3>Команда B · {state.scores.B} очков</h3>
        <ul>
          {state.players
            .filter((player) => player.team === 'B')
            .map((player) => (
              <li key={player.id}>{player.name}</li>
            ))}
        </ul>
      </section>
    </div>

    <button className="roomButton primary" type="button" disabled={!canStart} onClick={onStart}>
      {canStart ? 'Начать игру' : 'Старт доступен только хосту'}
    </button>
  </article>
}

export default Lobby
