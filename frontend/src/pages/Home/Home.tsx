import React from 'react'
import { Link } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'
import { routes } from '../../app/router/routeMap'
import './Home.css'

const featureItems = [
  {
    title: 'AI-генерация квизов',
    description: 'Собирайте вопросы за минуты: тема, сложность, формат и готовый набор раундов.',
  },
  {
    title: 'Игровые комнаты',
    description: 'Открывайте приватные и публичные комнаты, приглашайте игроков по PIN, invite или QR.',
  },
  {
    title: 'Telegram-боты',
    description: 'Подключайте ботов для запуска игр, рассылок и приёма ответов прямо в Telegram.',
  },
]

const planPreview = [
  {
    name: 'Starter',
    price: '0₽',
    summary: 'Первые квизы, базовые комнаты и ручной запуск.',
  },
  {
    name: 'Pro',
    price: '990₽/мес',
    summary: 'AI-генерация, больше комнат и аналитика по играм.',
  },
  {
    name: 'Team',
    price: 'от 2 990₽/мес',
    summary: 'Командные роли, Telegram-боты и приоритетная поддержка.',
  },
]

const faqItems = [
  {
    question: 'Как зайти по PIN?',
    answer: 'Откройте страницу Join, введите PIN комнаты и имя игрока. Если комната активна — вы сразу попадёте в лобби.',
  },
  {
    question: 'Чем invite отличается от PIN?',
    answer: 'Invite — это персональная ссылка/токен, которая сразу ведёт в нужную комнату. PIN можно передавать всем участникам.',
  },
  {
    question: 'Где использовать QR-код?',
    answer: 'Организатор показывает QR на экране, игроки сканируют его телефоном и автоматически переходят в Join.',
  },
]

const recentQuizzes = ['Weekly Standup Quiz', 'Frontend Deep Dive', 'Product Onboarding']
const recentRooms = ['ROOM-8142', 'ROOM-1930', 'ROOM-5561']

const HomePage: React.FC = () => {
  const { isAuthenticated, profile } = useAuth()

  return (
    <div className="homePage">
      <section className="homeHero pageCard">
        <div>
          <p className="homeLabel">RichCrabs Quiz Platform</p>
          <h1>{isAuthenticated ? `С возвращением, ${profile?.name ?? 'игрок'}!` : 'Создавайте и проводите квизы без лишней рутины'}</h1>
          <p>
            {isAuthenticated
              ? 'Запускайте новые игры за пару кликов: создайте квиз, откройте комнату и поделитесь доступом с участниками.'
              : 'Сделайте первый интерактивный квиз, пригласите участников по PIN/invite/QR и управляйте всем из одного кабинета.'}
          </p>
        </div>

        <div className="homeActions">
          <Link to={routes.quizzesNew} className="homeBtn homeBtnPrimary">
            Создать квиз
          </Link>
          <Link to={routes.join} className="homeBtn">
            Присоединиться к игре
          </Link>
          <Link to={routes.subscriptions} className="homeBtn">
            Смотреть тарифы
          </Link>
        </div>
      </section>

      {!isAuthenticated ? (
        <section className="pageCard homeOnboarding">
          <h2>Быстрый onboarding</h2>
          <ol>
            <li>Создайте первый квиз из шаблона или с AI-помощником.</li>
            <li>Откройте комнату и отправьте игрокам PIN или invite-ссылку.</li>
            <li>Покажите QR-код на экране, чтобы участники подключились за секунды.</li>
          </ol>
          <div className="homeSplitActions">
            <Link to={routes.authRegister} className="homeBtn homeBtnPrimary">
              Зарегистрироваться
            </Link>
            <Link to={routes.authLogin} className="homeBtn">
              У меня уже есть аккаунт
            </Link>
          </div>
        </section>
      ) : (
        <section className="pageCard homeQuickSection">
          <div>
            <h2>Быстрые действия</h2>
            <div className="homeSplitActions">
              <Link to={routes.quizzesNew} className="homeBtn homeBtnPrimary">
                Новый квиз
              </Link>
              <Link to={routes.roomsNew} className="homeBtn">
                Создать комнату
              </Link>
              <Link to={routes.join} className="homeBtn">
                Проверить вход по PIN
              </Link>
            </div>
          </div>

          <div className="homeRecentWrap">
            <div>
              <h3>Последние квизы</h3>
              <ul>
                {recentQuizzes.map((quiz) => (
                  <li key={quiz}>{quiz}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Последние комнаты</h3>
              <ul>
                {recentRooms.map((room) => (
                  <li key={room}>{room}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      <section className="homeGrid">
        <article className="pageCard">
          <h2>Возможности</h2>
          <div className="homeFeatureList">
            {featureItems.map((feature) => (
              <div key={feature.title} className="homeFeatureItem">
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="pageCard">
          <h2>Тарифы (preview)</h2>
          <div className="homePlans">
            {planPreview.map((plan) => (
              <div key={plan.name} className="homePlan">
                <h3>{plan.name}</h3>
                <p className="homePrice">{plan.price}</p>
                <p>{plan.summary}</p>
              </div>
            ))}
          </div>
          <Link to={routes.subscriptions} className="homeBtn homeBtnPrimary">
            Открыть все тарифы
          </Link>
        </article>
      </section>

      <section className="pageCard">
        <h2>FAQ: PIN, invite и QR</h2>
        <div className="homeFaq">
          {faqItems.map((faq) => (
            <div key={faq.question} className="homeFaqItem">
              <h3>{faq.question}</h3>
              <p>{faq.answer}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export default HomePage
