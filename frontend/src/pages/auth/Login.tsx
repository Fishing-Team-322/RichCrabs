import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'
import { routes } from '../../app/router/routeMap'
import { Button, Input } from '../../components/ui'
import { validateLogin, type LoginFormData } from '../../shared/validation/formSchemas'
import { ADMIN_LOGIN, ADMIN_PASSWORD } from '../../features/auth/adminAuth'
import { useNotifications } from '../../app/providers/NotificationProvider'
import { useTranslation } from 'react-i18next'

const Login = () => {
  const navigate = useNavigate()
  const { signIn, isLoading } = useAuth()
  const notifications = useNotifications()
  const { t } = useTranslation()
  const [form, setForm] = useState<LoginFormData>({ email: '', password: '' })
  const [mode, setMode] = useState<'user' | 'admin'>('user')
  const [errors, setErrors] = useState<Partial<Record<'email' | 'password' | 'root', string>>>({})

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = mode === 'admin'
      ? {
          ...(form.email.trim() ? {} : { email: 'Введите логин администратора.' }),
          ...(form.password ? {} : { password: 'Введите пароль.' }),
        }
      : validateLogin(form)

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
    <div className="authPage">
      <section className="authCard">
      <h1>{t('auth.loginTitle')}</h1>
      <p className="homeMuted">{t('auth.loginSubtitle')}</p>
      <Link to={routes.home} className="accountAction">{t('common.backToHome')}</Link>
      <div className="authTabs" role="tablist" aria-label="Режим входа">
        <button type="button" className={mode === 'user' ? 'authTab active' : 'authTab'} onClick={() => setMode('user')}>Пользователь</button>
        <button type="button" className={mode === 'admin' ? 'authTab active' : 'authTab'} onClick={() => setMode('admin')}>Админ</button>
      </div>
      <form onSubmit={(event) => void onSubmit(event)} className="authForm">
        <Input
          label={mode === 'admin' ? 'Логин' : 'Email'}
          error={errors.email}
          type={mode === 'admin' ? 'text' : 'email'}
          placeholder={mode === 'admin' ? '55555' : 'name@example.com'}
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
      {mode === 'admin' ? (
        <p className="homeMuted">
          Вход администратора: логин <b>{ADMIN_LOGIN}</b>, пароль <b>{ADMIN_PASSWORD}</b>. Регистрация администратора отключена.
        </p>
      ) : (
        <p className="homeMuted">
          Нет аккаунта? <Link to={routes.authRegister}>Зарегистрироваться</Link>
        </p>
      )}
      </section>
    </div>
  )
}

export default Login
