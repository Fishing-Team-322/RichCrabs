import {
  validateBotToken,
  validateCreateRoom,
  validateJoinByPin,
  validateLogin,
  validateQuizCreate,
  validateRegister,
} from '../formSchemas'

describe('form validators', () => {
  it('validates login and register forms', () => {
    expect(validateLogin({ email: '', password: '123' })).toMatchObject({
      email: 'Введите email.',
      password: 'Пароль должен быть не короче 6 символов.',
    })

    expect(
      validateRegister({
        name: 'A',
        email: 'bad-email',
        password: '123456',
        confirmPassword: '654321',
      }),
    ).toMatchObject({
      name: 'Имя должно содержать минимум 2 символа.',
      email: 'Введите корректный email.',
      confirmPassword: 'Пароли не совпадают.',
    })
  })

  it('validates quiz and room forms', () => {
    expect(
      validateQuizCreate({
        topic: 'ab',
        difficulty: 'easy',
        questionCount: 0,
        language: 'r',
        format: 'single',
      }),
    ).toMatchObject({
      topic: 'Укажите тему минимум из 3 символов.',
      questionCount: 'Количество вопросов: от 1 до 50.',
      language: 'Укажите язык квиза.',
    })

    expect(
      validateCreateRoom({
        quizId: '',
        playerLimit: 1,
        privacy: 'private',
        lobbyTimerSec: 5,
        questionTimerSec: 1,
        answerRevealSec: 1,
      }),
    ).toMatchObject({
      quizId: 'Выберите опубликованный квиз.',
      playerLimit: 'Лимит игроков: от 2 до 200.',
      lobbyTimerSec: 'Таймер лобби: от 10 до 600 сек.',
      questionTimerSec: 'Таймер вопроса: от 5 до 300 сек.',
      answerRevealSec: 'Пауза перед ответом: от 3 до 120 сек.',
    })
  })

  it('validates join and telegram token forms', () => {
    expect(validateJoinByPin({ playerName: 'A', pin: '12ab' })).toMatchObject({
      playerName: 'Введите имя игрока (минимум 2 символа).',
      pin: 'PIN должен состоять только из цифр (4-10 символов).',
    })

    expect(validateBotToken({ token: 'invalid' })).toMatchObject({
      token: 'Токен должен быть в формате 123456789:AA...',
    })
  })
})
