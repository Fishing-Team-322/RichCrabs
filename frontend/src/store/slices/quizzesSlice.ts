import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { quizApi } from '../../services/quizApi'
import type { RootState } from '../store'
import type { QuizListItemDto, QuizListParams } from '../../types/quiz.types'
import { getErrorMessage } from './asyncUtils'

interface CachedQuizList {
  items: QuizListItemDto[]
  fetchedAt: number
}

interface QuizzesState {
  cache: Record<string, CachedQuizList>
  optimisticBackup: Record<string, Record<string, string>>
  isLoading: boolean
  error: string | null
  stale: boolean
}

const initialState: QuizzesState = {
  cache: {},
  optimisticBackup: {},
  isLoading: false,
  error: null,
  stale: false,
}

const cacheKey = ({ status = 'draft', search = '' }: QuizListParams) => `${status}::${search.trim().toLowerCase()}`

const TTL_MS = 30_000

export const fetchQuizzes = createAsyncThunk<
  { key: string; items: QuizListItemDto[]; fetchedAt: number },
  QuizListParams | undefined,
  { rejectValue: string; state: RootState }
>('quizzes/fetchList', async (params = {}, { getState, rejectWithValue }) => {
  const key = cacheKey(params)
  const cached = getState().quizzes.cache[key]

  if (cached && Date.now() - cached.fetchedAt <= TTL_MS) {
    return { key, items: cached.items, fetchedAt: cached.fetchedAt }
  }

  try {
    const items = await quizApi.list(params)
    return { key, items, fetchedAt: Date.now() }
  } catch (error) {
    return rejectWithValue(getErrorMessage(error, 'Не удалось получить список квизов.'))
  }
})

export const renameQuizOptimistic = createAsyncThunk<
  { quizId: string },
  { quizId: string; title: string },
  { rejectValue: string }
>('quizzes/renameQuizOptimistic', async ({ quizId, title }, { rejectWithValue }) => {
  try {
    const draft = await quizApi.getDraft(quizId)
    await quizApi.saveDraft(quizId, {
      meta: {
        ...draft.meta,
        title: title.trim(),
      },
      questions: draft.questions,
    })

    return { quizId }
  } catch (error) {
    return rejectWithValue(getErrorMessage(error, 'Не удалось переименовать квиз.'))
  }
})

const quizzesSlice = createSlice({
  name: 'quizzes',
  initialState,
  reducers: {
    invalidateQuizzesCache: (state) => {
      state.stale = true
    },
    applyOptimisticQuizTitle: (state, action: PayloadAction<{ quizId: string; title: string }>) => {
      Object.values(state.cache).forEach((entry) => {
        entry.items = entry.items.map((quiz) =>
          quiz.id === action.payload.quizId
            ? {
                ...quiz,
                title: action.payload.title,
              }
            : quiz,
        )
      })
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchQuizzes.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchQuizzes.fulfilled, (state, action) => {
        state.isLoading = false
        state.cache[action.payload.key] = {
          items: action.payload.items,
          fetchedAt: action.payload.fetchedAt,
        }
        state.stale = false
      })
      .addCase(fetchQuizzes.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload || 'Не удалось загрузить квизы.'
      })
      .addCase(renameQuizOptimistic.pending, (state, action) => {
        state.error = null
        const { quizId, title } = action.meta.arg
        state.optimisticBackup[quizId] = {}
        Object.entries(state.cache).forEach(([key, entry]) => {
          const previous = entry.items.find((quiz) => quiz.id === quizId)
          if (previous) {
            state.optimisticBackup[quizId][key] = previous.title
          }
          entry.items = entry.items.map((quiz) => (quiz.id === quizId ? { ...quiz, title } : quiz))
        })
      })
      .addCase(renameQuizOptimistic.fulfilled, (state, action) => {
        delete state.optimisticBackup[action.payload.quizId]
        state.stale = true
      })
      .addCase(renameQuizOptimistic.rejected, (state, action) => {
        state.error = action.payload || 'Переименование квиза откатилось из-за ошибки.'
        const { quizId } = action.meta.arg
        const backup = state.optimisticBackup[quizId]

        if (backup) {
          Object.entries(state.cache).forEach(([key, entry]) => {
            const oldTitle = backup[key]
            if (!oldTitle) return
            entry.items = entry.items.map((quiz) => (quiz.id === quizId ? { ...quiz, title: oldTitle } : quiz))
          })
        }

        delete state.optimisticBackup[quizId]
      })
  },
})

export const selectQuizzesState = (state: RootState) => state.quizzes
export const selectQuizzesByFilter = (params: QuizListParams) => (state: RootState) =>
  state.quizzes.cache[cacheKey(params)]?.items || []
export const selectQuizzesLoading = (state: RootState) => state.quizzes.isLoading
export const selectQuizzesError = (state: RootState) => state.quizzes.error
export const selectQuizById = (quizId: string) => (state: RootState) =>
  Object.values(state.quizzes.cache)
    .flatMap((entry) => entry.items)
    .find((item) => item.id === quizId)

export const { invalidateQuizzesCache, applyOptimisticQuizTitle } = quizzesSlice.actions
export { cacheKey as quizzesCacheKey }
export default quizzesSlice.reducer
