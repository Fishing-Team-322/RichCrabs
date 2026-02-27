export type FieldErrors<T extends string> = Partial<Record<T, string>>

const roomPinRegex = /^\d{4,10}$/
const inviteTokenRegex = /^[A-Za-z0-9_-]{6,128}$/
const telegramTokenRegex = /^\d{6,12}:[A-Za-z0-9_-]{20,}$/

export interface LoginFormData {
  email: string
  password: string
}

export const validateLogin = (data: LoginFormData): FieldErrors<'email' | 'password'> => {
  const errors: FieldErrors<'email' | 'password'> = {}
  if (!data.email.trim()) errors.email = 'Введите email.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) errors.email = 'Введите корректный email.'

  if (!data.password) errors.password = 'Введите пароль.'
  else if (data.password.length < 6) errors.password = 'Пароль должен быть не короче 6 символов.'
  return errors
}

export interface RegisterFormData {
  name: string
  email: string
  password: string
  confirmPassword: string
}

export const validateRegister = (data: RegisterFormData): FieldErrors<'name' | 'email' | 'password' | 'confirmPassword'> => {
  const errors: FieldErrors<'name' | 'email' | 'password' | 'confirmPassword'> = {}
  if (data.name.trim().length < 2) errors.name = 'Имя должно содержать минимум 2 символа.'
  if (!data.email.trim()) errors.email = 'Введите email.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) errors.email = 'Введите корректный email.'
  if (data.password.length < 6) errors.password = 'Пароль должен быть не короче 6 символов.'
  if (!data.confirmPassword) errors.confirmPassword = 'Повторите пароль.'
  else if (data.password !== data.confirmPassword) errors.confirmPassword = 'Пароли не совпадают.'
  return errors
}

export interface QuizCreateFormData {
  topic: string
  difficulty: 'easy' | 'medium' | 'hard'
  questionCount: number
  language: string
  format: 'single' | 'multi'
}

export const validateQuizCreate = (data: QuizCreateFormData): FieldErrors<'topic' | 'questionCount' | 'language'> => {
  const errors: FieldErrors<'topic' | 'questionCount' | 'language'> = {}
  if (data.topic.trim().length < 3) errors.topic = 'Укажите тему минимум из 3 символов.'
  if (!Number.isInteger(data.questionCount) || data.questionCount < 1 || data.questionCount > 50) {
    errors.questionCount = 'Количество вопросов: от 1 до 50.'
  }
  if (data.language.trim().length < 2) errors.language = 'Укажите язык квиза.'
  return errors
}

export interface CreateRoomFormData {
  quizId: string
  playerLimit: number
  privacy: 'private' | 'public'
  lobbyTimerSec: number
  questionTimerSec: number
  answerRevealSec: number
}

export const validateCreateRoom = (data: CreateRoomFormData): FieldErrors<'quizId' | 'playerLimit' | 'lobbyTimerSec' | 'questionTimerSec' | 'answerRevealSec'> => {
  const errors: FieldErrors<'quizId' | 'playerLimit' | 'lobbyTimerSec' | 'questionTimerSec' | 'answerRevealSec'> = {}
  if (!data.quizId.trim()) errors.quizId = 'Выберите опубликованный квиз.'
  if (!Number.isInteger(data.playerLimit) || data.playerLimit < 2 || data.playerLimit > 200) errors.playerLimit = 'Лимит игроков: от 2 до 200.'
  if (!Number.isInteger(data.lobbyTimerSec) || data.lobbyTimerSec < 10 || data.lobbyTimerSec > 600) errors.lobbyTimerSec = 'Таймер лобби: от 10 до 600 сек.'
  if (!Number.isInteger(data.questionTimerSec) || data.questionTimerSec < 5 || data.questionTimerSec > 300) errors.questionTimerSec = 'Таймер вопроса: от 5 до 300 сек.'
  if (!Number.isInteger(data.answerRevealSec) || data.answerRevealSec < 3 || data.answerRevealSec > 120) errors.answerRevealSec = 'Пауза перед ответом: от 3 до 120 сек.'
  return errors
}

export interface JoinByPinFormData {
  playerName: string
  pin: string
}

export const validateJoinByPin = (data: JoinByPinFormData): FieldErrors<'playerName' | 'pin'> => {
  const errors: FieldErrors<'playerName' | 'pin'> = {}
  if (data.playerName.trim().length < 2) errors.playerName = 'Введите имя игрока (минимум 2 символа).'
  if (!data.pin.trim()) errors.pin = 'Введите PIN комнаты.'
  else if (!roomPinRegex.test(data.pin.trim())) errors.pin = 'PIN должен состоять только из цифр (4-10 символов).'
  return errors
}

export interface JoinByInviteFormData {
  playerName: string
  inviteToken: string
}

export const validateJoinByInvite = (data: JoinByInviteFormData): FieldErrors<'playerName' | 'inviteToken'> => {
  const errors: FieldErrors<'playerName' | 'inviteToken'> = {}
  if (data.playerName.trim().length < 2) errors.playerName = 'Введите имя игрока (минимум 2 символа).'
  if (!data.inviteToken.trim()) errors.inviteToken = 'Введите invite-token.'
  else if (!inviteTokenRegex.test(data.inviteToken.trim())) errors.inviteToken = 'Invite-token содержит недопустимые символы.'
  return errors
}

export interface BotTokenFormData {
  token: string
}

export const validateBotToken = (data: BotTokenFormData): FieldErrors<'token'> => {
  const errors: FieldErrors<'token'> = {}
  if (!data.token.trim()) errors.token = 'Введите bot token.'
  else if (!telegramTokenRegex.test(data.token.trim())) errors.token = 'Токен должен быть в формате 123456789:AA...'
  return errors
}
