import { z } from 'zod'

const roomPinRegex = /^\d{4,10}$/
const inviteTokenRegex = /^[A-Za-z0-9_-]{6,128}$/
const telegramTokenRegex = /^\d{6,12}:[A-Za-z0-9_-]{20,}$/

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Введите email.').email('Введите корректный email.'),
  password: z
    .string()
    .min(6, 'Пароль должен быть не короче 6 символов.')
    .max(128, 'Пароль слишком длинный.'),
})

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Имя должно содержать минимум 2 символа.').max(64, 'Имя слишком длинное.'),
    email: z.string().trim().min(1, 'Введите email.').email('Введите корректный email.'),
    password: z
      .string()
      .min(6, 'Пароль должен быть не короче 6 символов.')
      .max(128, 'Пароль слишком длинный.'),
    confirmPassword: z.string().min(1, 'Повторите пароль.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Пароли не совпадают.',
  })

export const quizCreateSchema = z.object({
  topic: z.string().trim().min(3, 'Укажите тему минимум из 3 символов.').max(120, 'Тема слишком длинная.'),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  questionCount: z.coerce.number().int().min(1, 'Минимум 1 вопрос.').max(50, 'Максимум 50 вопросов.'),
  language: z.string().trim().min(2, 'Укажите язык квиза.').max(32, 'Слишком длинное значение языка.'),
  format: z.enum(['single', 'multi']),
})

export const createRoomSchema = z.object({
  quizId: z.string().trim().min(1, 'Выберите опубликованный квиз.'),
  playerLimit: z.coerce.number().int().min(2, 'Минимум 2 игрока.').max(200, 'Максимум 200 игроков.'),
  privacy: z.enum(['private', 'public']),
  lobbyTimerSec: z.coerce.number().int().min(10, 'Минимум 10 секунд.').max(600, 'Максимум 600 секунд.'),
  questionTimerSec: z.coerce.number().int().min(5, 'Минимум 5 секунд.').max(300, 'Максимум 300 секунд.'),
  answerRevealSec: z.coerce.number().int().min(3, 'Минимум 3 секунды.').max(120, 'Максимум 120 секунд.'),
})

export const joinByPinSchema = z.object({
  playerName: z.string().trim().min(2, 'Введите имя игрока (минимум 2 символа).').max(40, 'Имя слишком длинное.'),
  pin: z
    .string()
    .trim()
    .min(1, 'Введите PIN комнаты.')
    .regex(roomPinRegex, 'PIN должен состоять только из цифр (4-10 символов).'),
})

export const joinByInviteSchema = z.object({
  playerName: z.string().trim().min(2, 'Введите имя игрока (минимум 2 символа).').max(40, 'Имя слишком длинное.'),
  inviteToken: z
    .string()
    .trim()
    .min(1, 'Введите invite-token.')
    .regex(inviteTokenRegex, 'Invite-token содержит недопустимые символы.'),
})

export const botTokenSchema = z.object({
  token: z
    .string()
    .trim()
    .min(1, 'Введите bot token.')
    .regex(telegramTokenRegex, 'Токен должен быть в формате 123456789:AA...'),
})

export type LoginFormData = z.infer<typeof loginSchema>
export type RegisterFormData = z.infer<typeof registerSchema>
export type QuizCreateFormData = z.infer<typeof quizCreateSchema>
export type CreateRoomFormData = z.infer<typeof createRoomSchema>
export type JoinByPinFormData = z.infer<typeof joinByPinSchema>
export type JoinByInviteFormData = z.infer<typeof joinByInviteSchema>
export type BotTokenFormData = z.infer<typeof botTokenSchema>
