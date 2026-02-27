import type { QuizAnswerResultDto } from '../../types/quiz.types'
import type { PlayerDto } from '../../types/room.types'

interface ResultProps {
  mode: 'feedback' | 'scoreboard' | 'final'
  scores: { A: number; B: number }
  answerResult?: QuizAnswerResultDto | null
  players: PlayerDto[]
}

const Result = ({ mode, scores, answerResult, players }: ResultProps) => {
  const titleByMode = {
    feedback: 'Результат ответа',
    scoreboard: 'Таблица счета',
    final: 'Финальные результаты',
  } as const

  return (
    <article className="pageCard quizRuntimeCard">
      <h2>{titleByMode[mode]}</h2>

      {mode === 'feedback' && answerResult && (
        <div className={`quizFeedback ${answerResult.correct ? 'correct' : 'incorrect'}`}>
          {answerResult.correct ? 'Верно! ✅' : `Неверно. Правильный вариант: ${answerResult.correctAnswer + 1}`}
        </div>
      )}

      <div className="quizTeamsGrid">
        <section className="quizTeamBlock teamA">
          <h3>Команда A — {scores.A}</h3>
          <ul>
            {players
              .filter((player) => player.team === 'A')
              .map((player) => (
                <li key={player.id}>{player.name}</li>
              ))}
          </ul>
        </section>
        <section className="quizTeamBlock teamB">
          <h3>Команда B — {scores.B}</h3>
          <ul>
            {players
              .filter((player) => player.team === 'B')
              .map((player) => (
                <li key={player.id}>{player.name}</li>
              ))}
          </ul>
        </section>
      </div>
    </article>
  )
}

export default Result
