import { test, expect } from '@playwright/test'

test('smoke: вход', async ({ page }) => {
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'token-1',
        refreshToken: 'refresh-1',
        user: { id: 'u-1', name: 'Alice', email: 'alice@example.com', gamesPlayed: 0, wins: 0 },
      }),
    })
  })

  await page.goto('/auth/login')
  await page.getByLabel('Email').fill('alice@example.com')
  await page.getByLabel('Пароль').fill('password123')
  await page.getByRole('button', { name: 'Войти' }).click()

  await expect(page).toHaveURL(/\/profile$/)
})

test('smoke: создание комнаты', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('token', 'token-1')
  })

  await page.route('**/api/user/profile', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'u-1', name: 'Alice', email: 'alice@example.com', gamesPlayed: 0, wins: 0 }),
    })
  })

  await page.route('**/api/quizzes?status=published', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'quiz-1', title: 'Space', language: 'ru', tags: [], status: 'published', updatedAt: new Date().toISOString(), questionsCount: 10 },
      ]),
    })
  })

  await page.route('**/api/rooms', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
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
        settings: { playerLimit: 20, privacy: 'private', timers: { lobbyTimerSec: 45, questionTimerSec: 30, answerRevealSec: 10 } },
        players: [],
      }),
    })
  })

  await page.goto('/rooms/new')
  await page.getByRole('button', { name: 'Создать комнату' }).click()
  await expect(page.getByText('Комната создана')).toBeVisible()
  await expect(page.getByText('654321')).toBeVisible()
})

test('smoke: подключение игрока по PIN', async ({ page }) => {
  await page.route('**/api/games/join', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: 'player-token', gameId: 'room-1', playerId: 'p-1' }),
    })
  })

  await page.goto('/join')
  await page.getByLabel('Player name').fill('Bob')
  await page.getByLabel('Room PIN').fill('654321')
  await page.getByRole('button', { name: /Enter game|Войти в игру/ }).click()

  await expect(page).toHaveURL(/\/quiz\/room-1$/)
})
