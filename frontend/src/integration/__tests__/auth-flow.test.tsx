import { Routes, Route } from 'react-router-dom'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Login from '../../pages/auth/Login'
import { renderWithProviders } from '../../test/renderWithProviders'
import { authApi } from '../../services/authApi'

vi.mock('../../services/authApi', () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    refresh: vi.fn(),
  },
}))

describe('integration: auth flow', () => {
  it('allows user to login and redirects to profile page', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      accessToken: 'token-1',
      refreshToken: 'refresh-1',
      user: {
        id: 'u-1',
        name: 'Alice',
        email: 'alice@example.com',
        gamesPlayed: 0,
        wins: 0,
      },
    })

    const user = userEvent.setup()

    renderWithProviders(
      <Routes>
        <Route path="/auth/login" element={<Login />} />
        <Route path="/profile" element={<div>Profile page</div>} />
      </Routes>,
      { route: '/auth/login' },
    )

    await user.type(screen.getByLabelText('Email'), 'alice@example.com')
    await user.type(screen.getByLabelText('Пароль'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByText('Profile page')).toBeInTheDocument()
    expect(authApi.login).toHaveBeenCalledWith({ email: 'alice@example.com', password: 'password123' })
  })
})
