const ru = {
  common: {
    home: 'Главная',
    profile: 'Профиль',
    login: 'Войти',
    logout: 'Выйти',
    backToHome: 'Назад на главную',
    language: 'Язык',
  },
  header: {
    title: 'Внутренние разделы',
  },
  home: {
    badge: 'RichCrabs UI platform',
    titleGuest: 'Современный набор для квизов и игровых комнат',
    titleAuth: 'С возвращением, {{name}}!',
    subtitle: 'Единый интерфейс для квизов, комнат, платежей и Telegram-ботов в фирменном dark-дизайне.',
    actions: { createQuiz: 'Создать квиз', join: 'Присоединиться', plans: 'Тарифы' },
    featuresTitle: 'Возможности',
    faqTitle: 'FAQ',
    features: [
      { title: 'AI-генерация квизов', description: 'Собирайте вопросы за минуты: тема, сложность, формат и готовый набор раундов.' },
      { title: 'Игровые комнаты', description: 'Открывайте приватные и публичные комнаты, приглашайте игроков по PIN, invite или QR.' },
      { title: 'Telegram-боты', description: 'Подключайте ботов для запуска игр, рассылок и приёма ответов прямо в Telegram.' },
    ],
    faq: [
      { title: 'PIN / invite / QR?', description: 'Все три варианта входа доступны сразу в комнате.' },
      { title: 'Адаптивность', description: 'Desktop, tablet и mobile теперь с единым UI-kit.' },
    ],
  },
  join: {
    title: 'Вход в комнату',
    pinTab: 'Ввод PIN',
    inviteTab: 'Invite-token',
    playerName: 'Имя игрока',
    roomPin: 'PIN комнаты',
    inviteToken: 'Invite-token',
    joinButton: 'Войти в игру',
    joining: 'Подключаем...',
  },
  quiz: {
    gameScreen: 'Игровой экран',
    noSession: 'Сессия игрока не найдена. Выполните вход через страницу join.',
    connecting: 'Подключаемся к игре...',
    connection: 'Связь',
    lobby: 'Лобби комнаты {{pin}}',
    waiting: 'Ожидаем начало игры. Ваша команда: {{team}}',
  },
  profile: {
    title: 'Профиль',
    loading: 'Загружаем профиль...',
    notFound: 'Профиль не найден.',
  },
  subscriptions: {
    loading: 'Загружаем биллинг...',
    title: 'Подписка и биллинг',
  },
  bots: {
    title: 'Telegram-боты',
    subtitle: 'Подключите bot token, чтобы создавать комнаты и выдавать приглашения через Telegram.',
  },
  auth: {
    loginTitle: 'Вход',
    registerTitle: 'Регистрация',
    loginSubtitle: 'Войдите в аккаунт RichCrabs, чтобы продолжить.',
    registerSubtitle: 'Создайте аккаунт, чтобы играть и управлять квизами.',
  },
}

export default ru
