import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { authApi } from '../../services/authApi'
import { clearAuthTokens } from '../../services/api'
import { profileApi } from '../../services/profileApi'
import type { UserDto } from '../../types/auth.types'
import type { RootState } from '../store'
import { getErrorMessage } from './asyncUtils'

interface AuthState {
  profile: UserDto | null
  isLoading: boolean
  error: string | null
  isInitialized: boolean
}

const initialState: AuthState = {
  profile: null,
  isLoading: false,
  error: null,
  isInitialized: false,
}

export const login = createAsyncThunk<UserDto, { email: string; password: string }, { rejectValue: string }>(
  'auth/login',
  async (credentials, { rejectWithValue }) => {
    try {
      await authApi.csrf()
      const response = await authApi.login(credentials)
      return response.user
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, 'Не удалось выполнить вход.'))
    }
  },
)

export const register = createAsyncThunk<
  UserDto,
  { displayName: string; email: string; password: string },
  { rejectValue: string }
>('auth/register', async (payload, { rejectWithValue }) => {
  try {
    await authApi.csrf()
    const response = await authApi.register(payload)
    return response.user
  } catch (error) {
    return rejectWithValue(getErrorMessage(error, 'Не удалось выполнить регистрацию.'))
  }
})

export const restoreSession = createAsyncThunk<
  { profile: UserDto | null },
  void,
  { rejectValue: string }
>('auth/restoreSession', async (_, { rejectWithValue }) => {
  try {
    const profile = await profileApi.getProfile()
    return { profile }
  } catch (error) {
    return rejectWithValue(getErrorMessage(error, 'Сессия истекла. Войдите заново.'))
  }
})

export const logout = createAsyncThunk('auth/logout', async () => {
  try {
    await authApi.logout()
  } finally {
    clearAuthTokens()
  }
})

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearAuthError: (state) => {
      state.error = null
    },
    setProfile: (state, action: PayloadAction<UserDto>) => {
      state.profile = action.payload
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(login.fulfilled, (state, action) => {
        state.isLoading = false
        state.profile = action.payload
        state.isInitialized = true
      })
      .addCase(login.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload || 'Ошибка входа.'
        state.isInitialized = true
      })
      .addCase(register.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(register.fulfilled, (state, action) => {
        state.isLoading = false
        state.profile = action.payload
        state.isInitialized = true
      })
      .addCase(register.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload || 'Ошибка регистрации.'
        state.isInitialized = true
      })
      .addCase(restoreSession.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(restoreSession.fulfilled, (state, action) => {
        state.isLoading = false
        state.profile = action.payload.profile
        state.isInitialized = true
      })
      .addCase(restoreSession.rejected, (state, action) => {
        state.isLoading = false
        state.profile = null
        state.error = action.payload || 'Не удалось восстановить сессию.'
        state.isInitialized = true
      })
      .addCase(logout.fulfilled, (state) => {
        state.profile = null
        state.error = null
        state.isLoading = false
        state.isInitialized = true
      })
  },
})

export const { clearAuthError, setProfile } = authSlice.actions
export const selectAuthState = (state: RootState) => state.auth
export default authSlice.reducer
