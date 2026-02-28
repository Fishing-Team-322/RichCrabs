import { Routes, Route } from 'react-router-dom'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CreateRoom from '../../pages/CreateRoom/CreateRoom'
import JoinPage from '../../pages/join/JoinPage'
import { renderWithProviders } from '../../test/renderWithProviders'
import { createAppStore } from '../../store/store'
import { setProfile } from '../../store/slices'
import { quizApi } from '../../services/quizApi'
import { roomsApi } from '../../services/roomsApi'
import { joinApi } from '../../services/joinApi'
import { billingApi } from '../../services/billingApi'

vi.mock('../../services/quizApi', () => ({
  quizApi: {
    list: vi.fn(),
  },
}))

vi.mock('../../services/roomsApi', () => ({
  roomsApi: {
    create: vi.fn(),
  },
}))

vi.mock('../../services/joinApi', () => ({
  joinApi: {
    joinByPin: vi.fn(),
    joinByInviteToken: vi.fn(),
  },
}))

vi.mock('../../services/billingApi', () => ({
  billingApi: {
    current: vi.fn(),
  },
}))

describe('integration: room create + join flow', () => {
  it('creates room and shows pin', async () => {
    vi.mocked(quizApi.list).mockResolvedValue([
      {
        id: 'quiz-1',
        title: 'Space',
        language: 'ru',
        tags: [],
        status: 'published',
        updatedAt: new Date().toISOString(),
        questionsCount: 10,
      },
    ])

    vi.mocked(billingApi.current).mockResolvedValue({ id: 'sub1', planCode: 'free', status: 'active', currentPeriodEnd: new Date().toISOString() })

    vi.mocked(roomsApi.create).mockResolvedValue({
      id: 'room-1',
      quizId: 'quiz-1',
      quizTitle: 'Space',
      pin: '654321',
      inviteLink: '/invite/room-token',
      status: 'waiting',
      playersCount: 0,
      playerLimit: 20,
      hostId: 'u-1',
      updatedAt: new Date().toISOString(),
      isHost: true,
      settings: {
        playerLimit: 20,
        privacy: 'private',
        timers: { lobbyTimerSec: 45, questionTimerSec: 30, answerRevealSec: 10 },
      },
      players: [],
    })

    const user = userEvent.setup()
    const store = createAppStore()
    store.dispatch(
      setProfile({
        id: 'u-1',
        displayName: 'Host',
        email: 'host@example.com',
        gamesPlayed: 0,
        wins: 0,
      }),
    )

    renderWithProviders(<CreateRoom />, { store })

    await user.click(await screen.findByRole('button', { name: 'Создать комнату' }))

    expect(await screen.findByText('Комната создана')).toBeInTheDocument()
    expect(screen.getByText('654321')).toBeInTheDocument()
  })

  it('joins room by pin and redirects to runtime', async () => {
    vi.mocked(joinApi.joinByPin).mockResolvedValue({
      token: 'player-token',
      gameId: 'room-1',
      playerId: 'p-1',
      wsUrl: 'ws://localhost:8080/ws',
    })

    const user = userEvent.setup()

    renderWithProviders(
      <Routes>
        <Route path="/join" element={<JoinPage />} />
        <Route path="/quiz/:roomId" element={<div>Runtime page</div>} />
      </Routes>,
      { route: '/join' },
    )

    const inputs = await screen.findAllByRole('textbox')
    await user.clear(inputs[0]!)
    await user.type(inputs[0]!, 'Alice')
    await user.type(inputs[1]!, '654321')
    await user.click(screen.getByRole('button', { name: /Enter game|Войти в игру/ }))

    expect(await screen.findByText('Runtime page')).toBeInTheDocument()
    expect(joinApi.joinByPin).toHaveBeenCalledWith('654321', 'Alice')
  })
})
