const en = {
  common: {
    home: 'Home',
    profile: 'Profile',
    login: 'Sign in',
    logout: 'Sign out',
    backToHome: 'Back to home',
    language: 'Language',
  },
  header: {
    title: 'Internal sections',
  },
  home: {
    badge: 'RichCrabs UI platform',
    titleGuest: 'Modern toolkit for quizzes and game rooms',
    titleAuth: 'Welcome back, {{name}}!',
    subtitle: 'A unified interface for quizzes, rooms, billing, and Telegram bots in signature dark UI.',
    actions: { createQuiz: 'Create quiz', join: 'Join', plans: 'Plans' },
    featuresTitle: 'Features',
    faqTitle: 'FAQ',
    features: [
      { title: 'AI quiz generation', description: 'Build question sets in minutes: topic, difficulty, format, and complete rounds.' },
      { title: 'Game rooms', description: 'Run private or public rooms and invite players via PIN, invite link, or QR.' },
      { title: 'Telegram bots', description: 'Connect bots for game launch, broadcasts, and collecting answers inside Telegram.' },
    ],
    faq: [
      { title: 'PIN / invite / QR?', description: 'All entry flows are available right away in each room.' },
      { title: 'Responsive UI', description: 'Desktop, tablet, and mobile are now covered by one UI kit.' },
    ],
  },
  join: {
    title: 'Join a room',
    pinTab: 'PIN input',
    inviteTab: 'Invite token',
    playerName: 'Player name',
    roomPin: 'Room PIN',
    inviteToken: 'Invite token',
    joinButton: 'Enter game',
    joining: 'Connecting...',
  },
  quiz: {
    gameScreen: 'Game screen',
    noSession: 'Player session was not found. Please sign in on the join page.',
    connecting: 'Connecting to game...',
    connection: 'Connection',
    lobby: 'Room lobby {{pin}}',
    waiting: 'Waiting for game start. Your team: {{team}}',
  },
  profile: {
    title: 'Profile',
    loading: 'Loading profile...',
    notFound: 'Profile not found.',
  },
  subscriptions: {
    loading: 'Loading billing...',
    title: 'Subscription and billing',
  },
  bots: {
    title: 'Telegram bots',
    subtitle: 'Connect a bot token to create rooms and issue invitations through Telegram.',
  },
  auth: {
    loginTitle: 'Sign in',
    registerTitle: 'Sign up',
    loginSubtitle: 'Sign in to your RichCrabs account to continue.',
    registerSubtitle: 'Create an account to play and manage quizzes.',
  },
}

export default en
