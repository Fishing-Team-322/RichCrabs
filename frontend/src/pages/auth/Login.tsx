import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import useAuth from '../../hooks/useAuth'
import { routes } from '../../app/router/routeMap'
import { Button, Input } from '../../components/ui'
import { loginSchema, type LoginFormData } from '../../shared/validation/formSchemas'
import { useNotifications } from '../../app/providers/NotificationProvider'

const Login = () => {
  const navigate = useNavigate()
  const { signIn, isLoading } = useAuth()
  const notifications = useNotifications()

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (data: LoginFormData) => {
    const result = await signIn(data.email.trim(), data.password)
    if (result.meta.requestStatus === 'fulfilled') {
      notifications.success('Вы успешно вошли в аккаунт.')
      navigate(routes.profile, { replace: true })
      return
    }

    const message = typeof result.payload === 'string' ? result.payload : 'Не удалось выполнить вход.'
    setError('root', { message })
    notifications.error(message)
  }

  return (
    <section className="authCard">
      <h1>Вход</h1>
      <p className="homeMuted">Войдите в аккаунт RichCrabs, чтобы продолжить.</p>
      <form onSubmit={handleSubmit((data) => void onSubmit(data))} className="homePage">
        <Input label="Email" error={errors.email?.message} type="email" placeholder="name@example.com" {...register('email')} />
        <Input label="Пароль" error={errors.password?.message} type="password" placeholder="••••••••" {...register('password')} />
        {errors.root?.message && <div className="ui-help">{errors.root.message}</div>}
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
