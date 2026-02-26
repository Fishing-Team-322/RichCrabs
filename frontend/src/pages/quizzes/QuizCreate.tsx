import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { routes } from '../../app/router/routeMap'
import { quizApi } from '../../services/quizApi'
import './quizzes.css'

const QuizCreate = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    setLoading(true)
    setError('')

    try {
      const draft = await quizApi.createDraft()
      navigate(routes.quizzesEdit.replace(':quizId', draft.id))
    } catch (apiError: unknown) {
      setError(apiError instanceof Error ? apiError.message : 'Не удалось создать черновик.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="quizPage">
      <div className="quizPanel">
        <h1>Создание квиза</h1>
        <p className="quizMuted">Создайте новый черновик и перейдите в редактор.</p>
        <button className="quizButton primary" onClick={() => void handleCreate()} disabled={loading}>
          {loading ? 'Создание...' : 'Создать draft'}
        </button>
      </div>
      {error && <div className="quizError">{error}</div>}
    </section>
  )
}

export default QuizCreate
