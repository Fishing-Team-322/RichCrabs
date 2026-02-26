import { FormEvent, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'
import { routes } from '../../app/router/routeMap'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const Register = () => {
  const navigate = useNavigate()
  const { signUp, isLoading, error } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const validationError = useMemo(() => {
    if (!name.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) return 'Заполните все поля.'
    if (name.trim().length < 2) return 'Имя должно быть длиннее 1 символа.'
    if (!EMAIL_PATTERN.test(email)) return 'Введите корректный email.'
    if (password.length < 6) return 'Пароль должен быть не короче 6 символов.'
    if (password !== confirmPassword) return 'Пароли не совпадают.'
    return null
  }, [name, email, password, confirmPassword])

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (validationError) {
      setFormError(validationError)
      return
    }

    setFormError(null)
    const result = await signUp(name.trim(), email.trim(), password)

    if (result.meta.requestStatus === 'fulfilled') {
      navigate(routes.profile, { replace: true })
    }
  }

  return (
    <section className="authCard">
      <h1>Регистрация</h1>
      <p>Создайте аккаунт, чтобы играть и управлять квизами.</p>
      <form onSubmit={onSubmit} className="authForm">
        <label>
          Имя
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Crab Master" />
        </label>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@example.com" />
        </label>
        <label>
          Пароль
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" />
        </label>
        <label>
          Повторите пароль
          <input
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            type="password"
            placeholder="••••••••"
          />
        </label>

        {(formError || error) && <div className="authError">{formError || error}</div>}

        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Создаем аккаунт...' : 'Зарегистрироваться'}
        </button>
      </form>
      <p>
        Уже есть аккаунт? <Link to={routes.authLogin}>Войти</Link>
      </p>
    </section>
  )
}

export default Register
