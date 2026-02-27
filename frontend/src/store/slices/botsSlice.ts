import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { botsApi } from '../../services/botsApi'
import type { BotDto } from '../../types/bot.types'
import type { RootState } from '../store'
import { getErrorMessage } from './asyncUtils'

interface BotsState {
  items: BotDto[]
  isLoading: boolean
  error: string | null
  stale: boolean
}

const initialState: BotsState = {
  items: [],
  isLoading: false,
  error: null,
  stale: true,
}

export const fetchBots = createAsyncThunk<BotDto[], void, { rejectValue: string }>('bots/fetch', async (_, { rejectWithValue }) => {
  try {
    return await botsApi.list()
  } catch (error) {
    return rejectWithValue(getErrorMessage(error, 'Не удалось загрузить ботов.'))
  }
})

export const removeBot = createAsyncThunk<string, string, { rejectValue: string }>('bots/remove', async (botId, { dispatch, rejectWithValue }) => {
  try {
    await botsApi.remove(botId)
    dispatch(invalidateBotsCache())
    return botId
  } catch (error) {
    return rejectWithValue(getErrorMessage(error, 'Не удалось удалить бота.'))
  }
})

const botsSlice = createSlice({
  name: 'bots',
  initialState,
  reducers: {
    invalidateBotsCache: (state) => {
      state.stale = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBots.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchBots.fulfilled, (state, action) => {
        state.isLoading = false
        state.items = action.payload
        state.stale = false
      })
      .addCase(fetchBots.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload || 'Ошибка загрузки ботов.'
      })
      .addCase(removeBot.fulfilled, (state, action) => {
        state.items = state.items.filter((bot) => bot.id !== action.payload)
      })
  },
})

export const selectBotsState = (state: RootState) => state.bots
export const selectBots = (state: RootState) => state.bots.items

export const { invalidateBotsCache } = botsSlice.actions
export default botsSlice.reducer
