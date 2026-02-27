import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useAuth from '../../hooks/useAuth'
import { routes } from '../../app/router/routeMap'
import { preloadJoinFlow } from '../../app/router/lazyPages'
import { Badge } from '../../components/ui'
import heroBlob from '../../assets/home-blob-primary.svg'
import heroOrb from '../../assets/home-blob-orb.svg'
import './Home.css'

type HomeItem = { title: string; description: string }

const HomePage: React.FC = () => {
  const { isAuthenticated, profile } = useAuth()
  const { t } = useTranslation()
  const [openFaq, setOpenFaq] = useState(0)

  const features = t('home.features', { returnObjects: true }) as HomeItem[]
  const faq = t('home.faq', { returnObjects: true }) as HomeItem[]

  const plans = useMemo(
    () => [
      {
        title: 'Starter',
        price: '$19',
        period: 'monthly',
        points: [features[0]?.title, features[1]?.title, t('home.actions.join')],
        cta: t('home.actions.createQuiz'),
        to: routes.quizzesNew,
      },
      {
        title: 'Scale',
        price: '$49',
        period: 'monthly',
        points: [features[0]?.description, features[1]?.description, features[2]?.title],
        cta: t('home.actions.plans'),
        to: routes.subscriptions,
        featured: true,
      },
      {
        title: 'Enterprise',
        price: '$99',
        period: 'monthly',
        points: [features[2]?.description, t('home.faqTitle'), t('home.actions.join')],
        cta: t('home.actions.plans'),
        to: routes.subscriptions,
      },
    ],
    [features, t],
  )

  return (
    <div className="homePage">
      <header className="homeNavWrap">
        <div className="homeNav">
          <Link to={routes.home} className="homeBrand">RichCrabs</Link>
          <nav className="homeNavLinks">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </nav>
          <Link className="ui-button primary" to={isAuthenticated ? routes.profile : routes.authLogin}>
            {isAuthenticated ? t('common.profile') : t('common.login')}
          </Link>
        </div>
      </header>

      <section className="homeHero">
        <div className="homeHeroContent">
          <Badge tone="neutral">{t('home.badge')}</Badge>
          <h1 className="homeTitle">
            {isAuthenticated
              ? t('home.titleAuth', { name: profile?.name ?? 'player' })
              : t('home.titleGuest')}
          </h1>
          <p className="homeMuted heroSubtitle">{t('home.subtitle')}</p>
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
        </div>
        <div className="heroVisual" aria-hidden>
          <img src={heroBlob} alt="" className="blobMain" />
          <img src={heroOrb} alt="" className="blobOrb" />
        </div>
      </section>

      <section id="features" className="homeCenterGrid">
        {features.map((feature) => (
          <article key={feature.title} className="homeGlassCard homeFeatureItem">
            <h3>{feature.title}</h3>
            <p className="homeMuted">{feature.description}</p>
          </article>
        ))}
      </section>

      <section id="pricing" className="homePricingWrap">
        <div className="sectionHeading">
          <Badge tone="neutral">{t('home.actions.plans')}</Badge>
          <h2>Predictable pricing for every team stage</h2>
        </div>
        <div className="pricingGrid">
          {plans.map((plan) => (
            <article key={plan.title} className={`homeGlassCard pricingCard ${plan.featured ? 'isFeatured' : ''}`}>
              {plan.featured && <span className="planBadge">Most popular</span>}
              <h3>{plan.title}</h3>
              <p className="planPrice">{plan.price} <span>{plan.period}</span></p>
              <ul>
                {plan.points.map((point) => <li key={`${plan.title}-${point}`}>{point}</li>)}
              </ul>
              <Link to={plan.to} className="ui-button primary">{plan.cta}</Link>
            </article>
          ))}
        </div>
      </section>

      <section id="faq" className="homeFaqSection">
        <div className="sectionHeading">
          <Badge tone="neutral">{t('home.faqTitle')}</Badge>
          <h2>Most popular questions</h2>
        </div>
        <div className="homeFaq">
          {faq.map((item, index) => (
            <button
              type="button"
              className={`homeFaqItem ${openFaq === index ? 'isOpen' : ''}`}
              onClick={() => setOpenFaq((prev) => (prev === index ? -1 : index))}
              key={item.title}
            >
              <div className="homeFaqHeader">
                <h3>{item.title}</h3>
                <span>{openFaq === index ? '−' : '+'}</span>
              </div>
              {openFaq === index && <p className="homeMuted">{item.description}</p>}
            </button>
          ))}
        </div>
      </section>

      <footer className="homeFooter">
        <div>
          <h3>RichCrabs</h3>
          <p className="homeMuted">{t('home.subtitle')}</p>
        </div>
        <div className="homeFooterLinks">
          <Link to={routes.join}>{t('home.actions.join')}</Link>
          <Link to={routes.subscriptions}>{t('home.actions.plans')}</Link>
          <Link to={isAuthenticated ? routes.profile : routes.authLogin}>
            {isAuthenticated ? t('common.profile') : t('common.login')}
          </Link>
        </div>
      </footer>
    </div>
  )
}

export default HomePage
