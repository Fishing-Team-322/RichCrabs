import { configureStore } from '@reduxjs/toolkit'
import {
  authReducer,
  billingReducer,
  botsReducer,
  gameSessionReducer,
  profileReducer,
  quizzesReducer,
  roomsReducer,
} from './slices'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    quizzes: quizzesReducer,
    rooms: roomsReducer,
    gameSession: gameSessionReducer,
    bots: botsReducer,
    billing: billingReducer,
    profile: profileReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
