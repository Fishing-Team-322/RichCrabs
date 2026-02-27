import { FormEvent, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'
import { routes } from '../../app/router/routeMap'
import { Button, Input } from '../../components/ui'

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
    if (validationError) return setFormError(validationError)
    setFormError(null)
    const result = await signUp(name.trim(), email.trim(), password)
    if (result.meta.requestStatus === 'fulfilled') navigate(routes.profile, { replace: true })
  }

  return (
    <section className="authCard">
      <h1>Регистрация</h1>
      <p className="homeMuted">Создайте аккаунт, чтобы играть и управлять квизами.</p>
      <form onSubmit={onSubmit} className="homePage">
        <Input label="Имя" value={name} onChange={(e) => setName(e.target.value)} placeholder="Crab Master" />
        <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@example.com" />
        <Input label="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" />
        <Input label="Повторите пароль" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type="password" placeholder="••••••••" />
        {(formError || error) && <div className="ui-help">{formError || error}</div>}
        <Button variant="primary" type="submit" loading={isLoading} fullWidth>{isLoading ? 'Создаем аккаунт...' : 'Зарегистрироваться'}</Button>
      </form>
      <p className="homeMuted">Уже есть аккаунт? <Link to={routes.authLogin}>Войти</Link></p>
    </section>
  )
}

export default Register
