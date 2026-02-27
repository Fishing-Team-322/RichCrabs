import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'
import { routes } from '../../app/router/routeMap'
import { Button, Input } from '../../components/ui'
import { validateRegister, type RegisterFormData } from '../../shared/validation/formSchemas'
import { useNotifications } from '../../app/providers/NotificationProvider'
import { useTranslation } from 'react-i18next'

const Register = () => {
  const navigate = useNavigate()
  const { signUp, isLoading } = useAuth()
  const notifications = useNotifications()
  const { t } = useTranslation()
  const [form, setForm] = useState<RegisterFormData>({ name: '', email: '', password: '', confirmPassword: '' })
  const [errors, setErrors] = useState<Partial<Record<'name' | 'email' | 'password' | 'confirmPassword' | 'root', string>>>({})

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateRegister(form)
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }

    setErrors({})
    const result = await signUp(form.name.trim(), form.email.trim(), form.password)
    if (result.meta.requestStatus === 'fulfilled') {
      notifications.success('Аккаунт создан. Добро пожаловать!')
      navigate(routes.profile, { replace: true })
      return
    }

    const message = typeof result.payload === 'string' ? result.payload : 'Не удалось зарегистрироваться.'
    setErrors({ root: message })
    notifications.error(message)
  }

  return (
    <section className="authCard">
      <h1>{t('auth.registerTitle')}</h1>
      <p className="homeMuted">{t('auth.registerSubtitle')}</p>
      <Link to={routes.home} className="accountAction">{t('common.backToHome')}</Link>
      <form onSubmit={(event) => void onSubmit(event)} className="homePage">
        <Input label="Имя" error={errors.name} placeholder="Crab Master" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
        <Input label="Email" error={errors.email} type="email" placeholder="name@example.com" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} />
        <Input label="Пароль" error={errors.password} type="password" placeholder="••••••••" value={form.password} onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))} />
        <Input
          label="Повторите пароль"
          error={errors.confirmPassword}
          type="password"
          placeholder="••••••••"
          value={form.confirmPassword}
          onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
        />
        {errors.root && <div className="ui-help">{errors.root}</div>}
        <Button variant="primary" type="submit" loading={isLoading} fullWidth>
          {isLoading ? 'Создаем аккаунт...' : 'Зарегистрироваться'}
        </Button>
      </form>
      <p className="homeMuted">
        Уже есть аккаунт? <Link to={routes.authLogin}>Войти</Link>
      </p>
    </section>
  )
}

export default Register
