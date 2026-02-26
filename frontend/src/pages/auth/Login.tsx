import { FormEvent, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'
import { routes } from '../../app/router/routeMap'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const Login = () => {
  const navigate = useNavigate()
  const { signIn, isLoading, error } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const validationError = useMemo(() => {
    if (!email.trim() || !password.trim()) return 'Заполните email и пароль.'
    if (!EMAIL_PATTERN.test(email)) return 'Введите корректный email.'
    if (password.length < 6) return 'Пароль должен быть не короче 6 символов.'
    return null
  }, [email, password])

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (validationError) {
      setFormError(validationError)
      return
    }

    setFormError(null)
    const result = await signIn(email.trim(), password)

    if (result.meta.requestStatus === 'fulfilled') {
      navigate(routes.profile, { replace: true })
    }
  }

  return (
    <section className="authCard">
      <h1>Вход</h1>
      <p>Войдите в аккаунт RichCrabs, чтобы продолжить.</p>
      <form onSubmit={onSubmit} className="authForm">
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@example.com" />
        </label>
        <label>
          Пароль
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" />
        </label>

        {(formError || error) && <div className="authError">{formError || error}</div>}

        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Входим...' : 'Войти'}
        </button>
      </form>
      <p>
        Нет аккаунта? <Link to={routes.authRegister}>Зарегистрироваться</Link>
      </p>
    </section>
  )
}

export default Login
