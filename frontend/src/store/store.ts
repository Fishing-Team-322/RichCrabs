import { configureStore } from '@reduxjs/toolkit'
import { authReducer, gameReducer, userReducer } from './slices/index.ts'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    user: userReducer,
    game: gameReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
