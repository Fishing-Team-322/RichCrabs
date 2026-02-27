import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'
import { routes } from '../../app/router/routeMap'
import { Button, Input } from '../../components/ui'
import { validateLogin, type LoginFormData } from '../../shared/validation/formSchemas'
import { useNotifications } from '../../app/providers/NotificationProvider'
import { useTranslation } from 'react-i18next'

const Login = () => {
  const navigate = useNavigate()
  const { signIn, isLoading } = useAuth()
  const notifications = useNotifications()
  const { t } = useTranslation()
  const [form, setForm] = useState<LoginFormData>({ email: '', password: '' })
  const [errors, setErrors] = useState<Partial<Record<'email' | 'password' | 'root', string>>>({})

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateLogin(form)
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }

    setErrors({})
    const result = await signIn(form.email.trim(), form.password)
    if (result.meta.requestStatus === 'fulfilled') {
      notifications.success('Вы успешно вошли в аккаунт.')
      navigate(routes.profile, { replace: true })
      return
    }

    const message = typeof result.payload === 'string' ? result.payload : 'Не удалось выполнить вход.'
    setErrors({ root: message })
    notifications.error(message)
  }

  return (
    <section className="authCard">
      <h1>{t('auth.loginTitle')}</h1>
      <p className="homeMuted">{t('auth.loginSubtitle')}</p>
      <Link to={routes.home} className="accountAction">{t('common.backToHome')}</Link>
      <form onSubmit={(event) => void onSubmit(event)} className="authForm">
        <Input
          label="Email"
          error={errors.email}
          type="email"
          placeholder="name@example.com"
          value={form.email}
          onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
        />
        <Input
          label="Пароль"
          error={errors.password}
          type="password"
          placeholder="••••••••"
          value={form.password}
          onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
        />
        {errors.root && <div className="ui-help">{errors.root}</div>}
        <Button variant="primary" type="submit" loading={isLoading} fullWidth>
          {isLoading ? 'Входим...' : 'Войти'}
        </Button>
      </form>
      <p className="homeMuted">
        Нет аккаунта? <Link to={routes.authRegister}>Зарегистрироваться</Link>
      </p>
    </section>
  )
}

export default Login
