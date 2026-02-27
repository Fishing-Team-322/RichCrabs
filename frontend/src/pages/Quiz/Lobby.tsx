import type { RoomStateDto, Team } from '../../types/room.types'

interface LobbyProps {
  state: RoomStateDto
  canStart: boolean
  playerTeam: Team | null
  onStart: () => void
  connectionLabel: string
}

const Lobby = ({ state, canStart, playerTeam, onStart, connectionLabel }: LobbyProps) => (
  <article className="pageCard quizRuntimeCard">
    <div className="quizRuntimeHeader">
      <h1>Лобби комнаты {state.pin}</h1>
      <span className="quizConnectionState">{connectionLabel}</span>
    </div>

    <p className="roomMeta">Ожидаем начало игры. Ваша команда: {playerTeam ?? '—'}</p>

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
)

export default Lobby
