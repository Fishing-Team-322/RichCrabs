import { Routes, Route } from 'react-router-dom'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QuizCreate from '../../pages/quizzes/QuizCreate'
import { renderWithProviders } from '../../test/renderWithProviders'
import { quizApi } from '../../services/quizApi'
import type { GenerateQuizDraftRequestDto, QuizGenerationStatus } from '../../types/quiz.types'

vi.mock('../../services/quizApi', () => ({
  quizApi: {
    draft: vi.fn(),
    generateDraft: vi.fn(),
  },
}))

describe('integration: quiz create flow', () => {
  it('creates quiz via AI flow and redirects to editor', async () => {
    vi.mocked(quizApi.generateDraft).mockImplementation(async (_payload: GenerateQuizDraftRequestDto, onStatus: ((status: QuizGenerationStatus) => void) | undefined) => {
      onStatus?.('running')
      return {
        id: 'draft-42',
        meta: { title: 'AI quiz', language: 'ru', tags: [], coverUrl: '' },
        questions: [],
        status: 'draft',
        version: 1,
        updatedAt: new Date().toISOString(),
      }
    })

    const user = userEvent.setup()

    renderWithProviders(
      <Routes>
        <Route path="/quizzes/new" element={<QuizCreate />} />
        <Route path="/quizzes/:quizId/edit" element={<div>Quiz editor</div>} />
      </Routes>,
      { route: '/quizzes/new' },
    )

    await user.click(screen.getByRole('button', { name: 'Через AI' }))
    await user.type(screen.getByLabelText('Тема'), 'Космос')
    await user.click(screen.getByRole('button', { name: 'Сгенерировать' }))

    expect(await screen.findByText('Quiz editor')).toBeInTheDocument()
    expect(quizApi.generateDraft).toHaveBeenCalled()
  })
})
