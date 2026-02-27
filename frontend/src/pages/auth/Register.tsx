import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import useAuth from '../../hooks/useAuth'
import { routes } from '../../app/router/routeMap'
import { Button, Input } from '../../components/ui'
import { registerSchema, type RegisterFormData } from '../../shared/validation/formSchemas'
import { useNotifications } from '../../app/providers/NotificationProvider'

const Register = () => {
  const navigate = useNavigate()
  const { signUp, isLoading } = useAuth()
  const notifications = useNotifications()

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  })

  const onSubmit = async (data: RegisterFormData) => {
    const result = await signUp(data.name.trim(), data.email.trim(), data.password)
    if (result.meta.requestStatus === 'fulfilled') {
      notifications.success('Аккаунт создан. Добро пожаловать!')
      navigate(routes.profile, { replace: true })
      return
    }

    const message = typeof result.payload === 'string' ? result.payload : 'Не удалось зарегистрироваться.'
    setError('root', { message })
    notifications.error(message)
  }

  return (
    <section className="authCard">
      <h1>Регистрация</h1>
      <p className="homeMuted">Создайте аккаунт, чтобы играть и управлять квизами.</p>
      <form onSubmit={handleSubmit((data) => void onSubmit(data))} className="homePage">
        <Input label="Имя" error={errors.name?.message} placeholder="Crab Master" {...register('name')} />
        <Input label="Email" error={errors.email?.message} type="email" placeholder="name@example.com" {...register('email')} />
        <Input label="Пароль" error={errors.password?.message} type="password" placeholder="••••••••" {...register('password')} />
        <Input
          label="Повторите пароль"
          error={errors.confirmPassword?.message}
          type="password"
          placeholder="••••••••"
          {...register('confirmPassword')}
        />
        {errors.root?.message && <div className="ui-help">{errors.root.message}</div>}
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
