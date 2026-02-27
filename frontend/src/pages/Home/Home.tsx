import React from 'react'
import { Link } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'
import { routes } from '../../app/router/routeMap'
import { Badge } from '../../components/ui'
import './Home.css'

const featureItems = [
  { title: 'AI-генерация квизов', description: 'Собирайте вопросы за минуты: тема, сложность, формат и готовый набор раундов.' },
  { title: 'Игровые комнаты', description: 'Открывайте приватные и публичные комнаты, приглашайте игроков по PIN, invite или QR.' },
  { title: 'Telegram-боты', description: 'Подключайте ботов для запуска игр, рассылок и приёма ответов прямо в Telegram.' },
]

const HomePage: React.FC = () => {
  const { isAuthenticated, profile } = useAuth()

  return (
    <div className="homePage">
      <section className="pageCard homeHero">
        <div>
          <Badge tone="neutral">RichCrabs UI platform</Badge>
          <h1 className="homeTitle">{isAuthenticated ? `С возвращением, ${profile?.name ?? 'игрок'}!` : 'Современный набор для квизов и игровых комнат'}</h1>
          <p className="homeMuted">Единый интерфейс для квизов, комнат, платежей и Telegram-ботов в фирменном dark-дизайне.</p>
        </div>
        <div className="homeActions">
          <Link to={routes.quizzesNew} className="ui-button primary">Создать квиз</Link>
          <Link to={routes.join} className="ui-button">Присоединиться</Link>
          <Link to={routes.subscriptions} className="ui-button">Тарифы</Link>
        </div>
      </section>

      <section className="homeGrid">
        <article className="pageCard">
          <h2>Возможности</h2>
          <div className="homeFeatureList">
            {featureItems.map((feature) => (
              <div key={feature.title} className="homeFeatureItem">
                <h3>{feature.title}</h3>
                <p className="homeMuted">{feature.description}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="pageCard">
          <h2>FAQ</h2>
          <div className="homeFaq">
            <div className="homeFaqItem"><h3>PIN / invite / QR?</h3><p className="homeMuted">Все три варианта входа доступны сразу в комнате.</p></div>
            <div className="homeFaqItem"><h3>Адаптивность</h3><p className="homeMuted">Desktop, tablet и mobile теперь с единым UI-kit.</p></div>
          </div>
        </article>
      </section>
    </div>
  )
}

export default HomePage
