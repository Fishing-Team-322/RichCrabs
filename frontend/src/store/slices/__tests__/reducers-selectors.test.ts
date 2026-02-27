import authReducer, { selectAuthState, setProfile } from '../authSlice'
import quizzesReducer, { applyOptimisticQuizTitle, selectQuizById, selectQuizzesByFilter } from '../quizzesSlice'
import roomsReducer, { selectRoomDetails, selectRoomsByStatus } from '../roomsSlice'
import type { RootState } from '../../store'

describe('reducers and selectors', () => {
  it('updates auth profile in reducer and selector returns state', () => {
    const state = authReducer(undefined, setProfile({
      id: 'u-1',
      email: 'user@example.com',
      name: 'User',
      gamesPlayed: 1,
      wins: 0,
    }))

    const rootState = {
      auth: state,
    } as RootState

    expect(state.profile?.name).toBe('User')
    expect(selectAuthState(rootState).profile?.email).toBe('user@example.com')
  })

  it('applies optimistic quiz rename and returns quiz by selector', () => {
    const preloaded = {
      cache: {
        'draft::': {
          fetchedAt: Date.now(),
          items: [
            {
              id: 'quiz-1',
              title: 'Old title',
              language: 'ru',
              tags: [],
              status: 'draft' as const,
              updatedAt: new Date().toISOString(),
              questionsCount: 10,
            },
          ],
        },
      },
      optimisticBackup: {},
      isLoading: false,
      error: null,
      stale: false,
    }

    const state = quizzesReducer(preloaded, applyOptimisticQuizTitle({ quizId: 'quiz-1', title: 'New title' }))
    const rootState = {
      quizzes: state,
    } as RootState

    expect(selectQuizzesByFilter({ status: 'draft' })(rootState)[0]?.title).toBe('New title')
    expect(selectQuizById('quiz-1')(rootState)?.title).toBe('New title')
  })

  it('returns rooms by status and details by id selectors', () => {
    const state = roomsReducer(
      {
        listCache: {
          waiting: {
            rooms: [
              {
                id: 'room-1',
                quizId: 'quiz-1',
                quizTitle: 'Quiz',
                pin: '123456',
                inviteLink: '/invite/token',
                status: 'waiting',
                playersCount: 1,
                playerLimit: 10,
                hostId: 'u-1',
                updatedAt: new Date().toISOString(),
                isHost: true,
              },
            ],
            fetchedAt: Date.now(),
          },
        },
        detailsById: {
          'room-1': {
            id: 'room-1',
            quizId: 'quiz-1',
            quizTitle: 'Quiz',
            pin: '123456',
            inviteLink: '/invite/token',
            status: 'waiting',
            playersCount: 1,
            playerLimit: 10,
            hostId: 'u-1',
            updatedAt: new Date().toISOString(),
            isHost: true,
            settings: {
              playerLimit: 10,
              privacy: 'private',
              timers: {
                lobbyTimerSec: 60,
                questionTimerSec: 30,
                answerRevealSec: 10,
              },
            },
            players: [],
          },
        },
        isLoading: false,
        error: null,
        stale: false,
      },
      { type: 'rooms/noop' },
    )

    const rootState = {
      rooms: state,
    } as RootState

    expect(selectRoomsByStatus('waiting')(rootState)).toHaveLength(1)
    expect(selectRoomDetails('room-1')(rootState)?.pin).toBe('123456')
  })
})
