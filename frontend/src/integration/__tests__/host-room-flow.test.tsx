import { Route, Routes } from 'react-router-dom'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CreateRoom from '../../pages/CreateRoom/CreateRoom'
import RoomDetails from '../../pages/rooms/RoomDetails'
import { renderWithProviders } from '../../test/renderWithProviders'
import { createAppStore } from '../../store/store'
import { setProfile } from '../../store/slices'
import { quizApi } from '../../services/quizApi'
import { roomsApi } from '../../services/roomsApi'
import { botsApi } from '../../services/botsApi'

vi.mock('../../services/quizApi', () => ({
  quizApi: {
    list: vi.fn(),
  },
}))

vi.mock('../../services/roomsApi', () => ({
  roomsApi: {
    create: vi.fn(),
    subscribeRoomDetails: vi.fn(),
    regenerateInvite: vi.fn(),
    open: vi.fn(),
    pause: vi.fn(),
    close: vi.fn(),
    details: vi.fn(),
  },
}))

vi.mock('../../services/botsApi', () => ({
  botsApi: {
    validate: vi.fn(),
    bind: vi.fn(),
  },
}))

describe('integration: host flow room details + bot offer', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('create room redirects to details and allows skip bot offer', async () => {
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

    vi.mocked(roomsApi.create).mockResolvedValue({
      id: 'room-1',
      quizId: 'quiz-1',
      quizTitle: 'Space',
      pin: '654321',
      inviteLink: '/invite/token',
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

    vi.mocked(roomsApi.regenerateInvite).mockResolvedValue({ inviteToken: 'token', invitePath: '/invite/token', inviteQrSvg: '<svg />' })
    vi.mocked(roomsApi.subscribeRoomDetails).mockImplementation((_roomId, cb) => {
      cb({
        id: 'room-1',
        quizId: 'quiz-1',
        quizTitle: 'Space',
        pin: '654321',
        inviteLink: '/invite/token',
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
      return () => undefined
    })

    const user = userEvent.setup()
    const store = createAppStore()
    store.dispatch(setProfile({
      id: 'u-1',
      displayName: 'Host',
      email: 'host@example.com',
      gamesPlayed: 0,
      wins: 0,
      subscription: 'pro',
    }))

    renderWithProviders(
      <Routes>
        <Route path="/rooms/new" element={<CreateRoom />} />
        <Route path="/rooms/:roomId" element={<RoomDetails />} />
      </Routes>,
      { route: '/rooms/new', store },
    )

    await user.click(await screen.findByRole('button', { name: 'Создать комнату' }))

    expect(await screen.findByText('Пригласить игроков')).toBeInTheDocument()
    expect(await screen.findByText('Хотите подключить Telegram-бота для этой игры?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Не сейчас' }))

    await waitFor(() => {
      expect(screen.queryByText('Хотите подключить Telegram-бота для этой игры?')).not.toBeInTheDocument()
    })
  })

  it('calls validate and bind for telegram token', async () => {
    vi.mocked(roomsApi.regenerateInvite).mockResolvedValue({ inviteToken: 'token', invitePath: '/invite/token', inviteQrSvg: '<svg />' })
    vi.mocked(roomsApi.subscribeRoomDetails).mockImplementation((_roomId, cb) => {
      cb({
        id: 'room-1',
        quizId: 'quiz-1',
        quizTitle: 'Space',
        pin: '654321',
        inviteLink: '/invite/token',
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
      return () => undefined
    })

    vi.mocked(botsApi.validate).mockResolvedValue({ ok: true, botId: 'b1' })
    vi.mocked(botsApi.bind).mockResolvedValue({ bindingId: 'b1', botId: 'b1' })

    const user = userEvent.setup()
    const store = createAppStore()
    store.dispatch(setProfile({
      id: 'u-1',
      displayName: 'Host',
      email: 'host@example.com',
      gamesPlayed: 0,
      wins: 0,
      subscription: 'pro',
    }))

    renderWithProviders(
      <Routes>
        <Route path="/rooms/:roomId" element={<RoomDetails />} />
      </Routes>,
      { route: '/rooms/room-1?botOffer=1', store },
    )


    await waitFor(() => expect(screen.getByText('Хотите подключить Telegram-бота для этой игры?')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Подключить' }))

    const tokenInput = screen.getByPlaceholderText('123456789:AA...')
    await user.type(tokenInput, '123456789:ABCDEFGHIJKLMNOPQRSTUV')

    await user.click(screen.getByRole('button', { name: 'Проверить токен' }))
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => {
      expect(botsApi.validate).toHaveBeenCalledWith({ token: '123456789:ABCDEFGHIJKLMNOPQRSTUV' })
      expect(botsApi.bind).toHaveBeenCalledWith({ token: '123456789:ABCDEFGHIJKLMNOPQRSTUV' })
    })
  })
})
