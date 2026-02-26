import { useCallback } from 'react'
import { login, logout, register } from '../store/slices'
import { useAppDispatch, useAppSelector } from '../store/hooks'

export const useAuth = () => {
  const dispatch = useAppDispatch()
  const auth = useAppSelector((state) => state.auth)

  const signIn = useCallback(
    (email: string, password: string) => dispatch(login({ email, password })),
    [dispatch],
  )

  const signUp = useCallback(
    (name: string, email: string, password: string) => dispatch(register({ name, email, password })),
    [dispatch],
  )

  const signOut = useCallback(() => dispatch(logout()), [dispatch])

  return {
    ...auth,
    isAuthenticated: Boolean(auth.profile && auth.token),
    signIn,
    signUp,
    signOut,
  }
}
