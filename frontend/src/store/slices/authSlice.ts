import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { authApi } from '../../services/authApi'
import { clearAuthTokens } from '../../services/api'
import { profileApi } from '../../services/profileApi'
import type { UserDto } from '../../types/auth.types'
import type { RootState } from '../store'
import { getErrorMessage } from './asyncUtils'

const ACCESS_TOKEN_KEY = 'token'
const REFRESH_TOKEN_KEY = 'refresh_token'

interface AuthState {
  token: string | null
  refreshToken: string | null
  profile: UserDto | null
  isLoading: boolean
  error: string | null
  isInitialized: boolean
}

interface AuthPayload {
  token: string | null
  refreshToken: string | null
  profile: UserDto
}

const initialState: AuthState = {
  token: localStorage.getItem(ACCESS_TOKEN_KEY),
  refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY),
  profile: null,
  isLoading: false,
  error: null,
  isInitialized: false,
}

export const login = createAsyncThunk<AuthPayload, { email: string; password: string }, { rejectValue: string }>(
  'auth/login',
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await authApi.login(credentials)
      return {
        token: response.accessToken || response.token || null,
        refreshToken: response.refreshToken || null,
        profile: response.user,
      }
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, 'Не удалось выполнить вход.'))
    }
  },
)

export const register = createAsyncThunk<
  AuthPayload,
  { name: string; email: string; password: string },
  { rejectValue: string }
>('auth/register', async (payload, { rejectWithValue }) => {
  try {
    const response = await authApi.register(payload)
    return {
      token: response.accessToken || response.token || null,
      refreshToken: response.refreshToken || null,
      profile: response.user,
    }
  } catch (error) {
    return rejectWithValue(getErrorMessage(error, 'Не удалось выполнить регистрацию.'))
  }
})

export const restoreSession = createAsyncThunk<
  { token: string | null; refreshToken: string | null; profile: UserDto | null },
  void,
  { rejectValue: string }
>('auth/restoreSession', async (_, { rejectWithValue }) => {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY)
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)

  if (!token) {
    return { token: null, refreshToken: null, profile: null }
  }

  try {
    const profile = await profileApi.getProfile()
    return { token, refreshToken, profile }
  } catch (error) {
    clearAuthTokens()
    return rejectWithValue(getErrorMessage(error, 'Сессия истекла. Войдите заново.'))
  }
})

export const logout = createAsyncThunk('auth/logout', async () => {
  clearAuthTokens()
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
        state.profile = action.payload.profile
        state.token = action.payload.token
        state.refreshToken = action.payload.refreshToken
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
        state.profile = action.payload.profile
        state.token = action.payload.token
        state.refreshToken = action.payload.refreshToken
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
        state.token = action.payload.token
        state.refreshToken = action.payload.refreshToken
        state.profile = action.payload.profile
        state.isInitialized = true
      })
      .addCase(restoreSession.rejected, (state, action) => {
        state.isLoading = false
        state.token = null
        state.refreshToken = null
        state.profile = null
        state.error = action.payload || 'Не удалось восстановить сессию.'
        state.isInitialized = true
      })
      .addCase(logout.fulfilled, (state) => {
        state.token = null
        state.refreshToken = null
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
