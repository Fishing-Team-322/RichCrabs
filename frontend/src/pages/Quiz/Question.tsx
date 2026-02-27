import type { QuizQuestionDto } from '../../types/quiz.types'
import type { Team } from '../../types/room.types'

interface QuestionProps {
  question: QuizQuestionDto
  scores: { A: number; B: number }
  activeTurn: Team | null
  playerTeam: Team | null
  timerSec: number
  hasAnswered: boolean
  canAnswer: boolean
  onAnswer: (index: number) => void
}

const Question = ({
  question,
  scores,
  activeTurn,
  playerTeam,
  timerSec,
  hasAnswered,
  canAnswer,
  onAnswer,
}: QuestionProps) => (
  <article className="pageCard quizRuntimeCard">
    <div className="quizQuestionTop">
      <div>
        <h2>{question.text}</h2>
        <p className="roomMeta">Ваша команда: {playerTeam ?? '—'}</p>
      </div>
      <div className="quizTimer">⏱ {Math.max(timerSec, 0)}с</div>
    </div>

    <div className="quizScoreLine">
      <span className={`quizTeamScore ${activeTurn === 'A' ? 'activeTurn' : ''}`}>A: {scores.A}</span>
      <span className={`quizTeamScore ${activeTurn === 'B' ? 'activeTurn' : ''}`}>B: {scores.B}</span>
    </div>

    <div className="quizOptions">
      {question.options.map((option, index) => {
        const disabled = hasAnswered || !canAnswer
        return (
          <button className="roomButton" key={`${question.id}-${option}`} type="button" disabled={disabled} onClick={() => onAnswer(index)}>
            {option}
          </button>
        )
      })}
    </div>

    {hasAnswered && <p className="roomMeta">Ответ отправлен. Ожидайте результат.</p>}
    {!canAnswer && !hasAnswered && <p className="roomMeta">Сейчас отвечает другая команда или время вышло.</p>}
  </article>
)

export default Question
