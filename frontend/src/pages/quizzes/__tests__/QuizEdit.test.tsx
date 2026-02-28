import { Route, Routes } from 'react-router-dom'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import QuizEdit from '../QuizEdit'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { quizApi } from '../../../services/quizApi'

vi.mock('../../../services/quizApi', () => ({
  quizApi: {
    getDraft: vi.fn(),
    saveDraft: vi.fn(),
  },
}))

describe('QuizEdit', () => {
  it('shows warning and keeps all options unselected when correct answer is missing', async () => {
    vi.mocked(quizApi.getDraft).mockResolvedValue({
      id: 'draft-1',
      meta: { title: 'AI quiz', language: 'ru', tags: [], coverUrl: '' },
      questions: [
        {
          id: 'q1',
          text: 'Question',
          options: [
            { id: 'q1-0', text: 'Option 1' },
            { id: 'q1-1', text: 'Option 2' },
          ],
          correctOptionId: '',
          requiresCorrectOptionSelection: true,
          timeLimitSec: 20,
          difficulty: 'medium',
        },
      ],
      status: 'draft',
      version: 1,
      updatedAt: new Date().toISOString(),
    })

    renderWithProviders(
      <Routes>
        <Route path="/quizzes/:quizId/edit" element={<QuizEdit />} />
      </Routes>,
      { route: '/quizzes/draft-1/edit' },
    )

    await screen.findByText('Редактор квиза')

    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(2)
    expect(radios.every((radio) => !(radio as HTMLInputElement).checked)).toBe(true)
    expect(screen.getByText('У вопроса не выбран правильный вариант. Выберите один из ответов.')).toBeInTheDocument()
  })
})
