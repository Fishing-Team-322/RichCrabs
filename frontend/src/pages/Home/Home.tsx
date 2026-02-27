import React from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useAuth from '../../hooks/useAuth'
import { routes } from '../../app/router/routeMap'
import { preloadJoinFlow } from '../../app/router/lazyPages'
import { Badge } from '../../components/ui'
import './Home.css'

const HomePage: React.FC = () => {
  const { isAuthenticated, profile } = useAuth()
  const { t } = useTranslation()

  const features = t('home.features', { returnObjects: true }) as Array<{ title: string; description: string }>
  const faq = t('home.faq', { returnObjects: true }) as Array<{ title: string; description: string }>

  return (
    <div className="homePage">
      <section className="pageCard homeHero">
        <div>
          <Badge tone="neutral">{t('home.badge')}</Badge>
          <h1 className="homeTitle">
            {isAuthenticated
              ? t('home.titleAuth', { name: profile?.name ?? 'player' })
              : t('home.titleGuest')}
          </h1>
          <p className="homeMuted">{t('home.subtitle')}</p>
        </div>
        <div className="homeActions">
          <Link to={routes.quizzesNew} className="ui-button primary">{t('home.actions.createQuiz')}</Link>
          <Link
            to={routes.join}
            className="ui-button"
            onMouseEnter={() => void preloadJoinFlow()}
            onFocus={() => void preloadJoinFlow()}
          >
            {t('home.actions.join')}
          </Link>
          <Link to={routes.subscriptions} className="ui-button">{t('home.actions.plans')}</Link>
        </div>
      </section>

      <section className="homeCenterGrid">
        {features.map((feature) => (
          <article key={feature.title} className="pageCard homeFeatureItem">
            <h3>{feature.title}</h3>
            <p className="homeMuted">{feature.description}</p>
          </article>
        ))}
      </section>

      <section className="homeGrid">
        <article className="pageCard">
          <h2>{t('home.featuresTitle')}</h2>
          <div className="homeFeatureList">
            {features.map((feature) => (
              <div key={`list-${feature.title}`} className="homeFeatureItem compact">
                <h3>{feature.title}</h3>
                <p className="homeMuted">{feature.description}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="pageCard">
          <h2>{t('home.faqTitle')}</h2>
          <div className="homeFaq">
            {faq.map((item) => (
              <div className="homeFaqItem" key={item.title}><h3>{item.title}</h3><p className="homeMuted">{item.description}</p></div>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}

export default HomePage
