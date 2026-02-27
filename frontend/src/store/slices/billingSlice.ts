import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { billingApi } from '../../services/billingApi'
import type { BillingHistoryDto, BillingPlanDto, SubscriptionDto } from '../../types/billing.types'
import type { RootState } from '../store'
import { getErrorMessage } from './asyncUtils'

interface BillingState {
  plans: BillingPlanDto[]
  current: SubscriptionDto | null
  history: BillingHistoryDto | null
  isLoading: boolean
  error: string | null
  stale: boolean
}

const initialState: BillingState = {
  plans: [],
  current: null,
  history: null,
  isLoading: false,
  error: null,
  stale: true,
}

export const fetchBillingOverview = createAsyncThunk<
  { plans: BillingPlanDto[]; current: SubscriptionDto | null; history: BillingHistoryDto | null },
  void,
  { rejectValue: string }
>('billing/fetchOverview', async (_, { rejectWithValue }) => {
  try {
    const [plans, current, history] = await Promise.all([
      billingApi.plans(),
      billingApi.current().catch(() => null),
      billingApi.history().catch(() => null),
    ])

    return { plans, current, history }
  } catch (error) {
    return rejectWithValue(getErrorMessage(error, 'Не удалось загрузить биллинг.'))
  }
})

export const cancelSubscription = createAsyncThunk<void, void, { rejectValue: string }>(
  'billing/cancel',
  async (_, { dispatch, rejectWithValue }) => {
    try {
      await billingApi.cancel()
      dispatch(invalidateBillingCache())
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, 'Не удалось отменить подписку.'))
    }
  },
)

const billingSlice = createSlice({
  name: 'billing',
  initialState,
  reducers: {
    invalidateBillingCache: (state) => {
      state.stale = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBillingOverview.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchBillingOverview.fulfilled, (state, action) => {
        state.isLoading = false
        state.plans = action.payload.plans
        state.current = action.payload.current
        state.history = action.payload.history
        state.stale = false
      })
      .addCase(fetchBillingOverview.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload || 'Ошибка загрузки биллинга.'
      })
      .addCase(cancelSubscription.rejected, (state, action) => {
        state.error = action.payload || 'Не удалось отменить подписку.'
      })
  },
})

export const selectBillingState = (state: RootState) => state.billing
export const selectBillingPlans = (state: RootState) => state.billing.plans

export const { invalidateBillingCache } = billingSlice.actions
export default billingSlice.reducer
