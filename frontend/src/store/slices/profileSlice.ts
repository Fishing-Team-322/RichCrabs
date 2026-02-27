import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { profileApi } from '../../services/profileApi'
import type { PasswordChangeDto, SessionDto, UpdateProfileDto, UserDto } from '../../types/auth.types'
import type { RootState } from '../store'
import { getErrorMessage } from './asyncUtils'

interface ProfileState {
  profile: UserDto | null
  sessions: SessionDto[]
  sessionsSupported: boolean
  isLoading: boolean
  error: string | null
}

const initialState: ProfileState = {
  profile: null,
  sessions: [],
  sessionsSupported: true,
  isLoading: false,
  error: null,
}

export const fetchProfile = createAsyncThunk<UserDto, void, { rejectValue: string }>(
  'profile/fetch',
  async (_, { rejectWithValue }) => {
    try {
      return await profileApi.getProfile()
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, 'Не удалось загрузить профиль.'))
    }
  },
)

export const updateProfile = createAsyncThunk<UserDto, UpdateProfileDto, { rejectValue: string }>(
  'profile/update',
  async (payload, { rejectWithValue }) => {
    try {
      return await profileApi.updateProfile(payload)
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, 'Не удалось обновить профиль.'))
    }
  },
)

export const fetchProfileSessions = createAsyncThunk<
  { sessions: SessionDto[]; sessionsSupported: boolean },
  void,
  { rejectValue: string }
>('profile/fetchSessions', async (_, { rejectWithValue }) => {
  try {
    const sessions = await profileApi.getSessions()
    return { sessions: Array.isArray(sessions) ? sessions : [], sessionsSupported: true }
  } catch (error) {
    const message = getErrorMessage(error, 'Не удалось получить сессии.')
    if (message.includes('404')) {
      return { sessions: [], sessionsSupported: false }
    }

    return rejectWithValue(message)
  }
})


export const changeProfilePassword = createAsyncThunk<void, PasswordChangeDto, { rejectValue: string }>(
  'profile/changePassword',
  async (payload, { rejectWithValue }) => {
    try {
      await profileApi.changePassword(payload)
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, 'Не удалось изменить пароль.'))
    }
  },
)

const profileSlice = createSlice({
  name: 'profile',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchProfile.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchProfile.fulfilled, (state, action) => {
        state.isLoading = false
        state.profile = action.payload
      })
      .addCase(fetchProfile.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload || 'Ошибка загрузки профиля.'
      })
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.profile = action.payload
      })
      .addCase(updateProfile.rejected, (state, action) => {
        state.error = action.payload || 'Ошибка обновления профиля.'
      })
      .addCase(fetchProfileSessions.fulfilled, (state, action) => {
        state.sessions = action.payload.sessions
        state.sessionsSupported = action.payload.sessionsSupported
      })
      .addCase(fetchProfileSessions.rejected, (state, action) => {
        state.error = action.payload || 'Ошибка загрузки сессий.'
      })
      .addCase(changeProfilePassword.rejected, (state, action) => {
        state.error = action.payload || 'Ошибка смены пароля.'
      })
  },
})

export const selectProfileState = (state: RootState) => state.profile
export const selectProfile = (state: RootState) => state.profile.profile

export default profileSlice.reducer
