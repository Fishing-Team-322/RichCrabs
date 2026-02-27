import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { roomsApi } from '../../services/roomsApi'
import type { ListRoomsParams, RoomDetailsDto, RoomSummaryDto } from '../../types/room.types'
import type { RootState } from '../store'
import { getErrorMessage } from './asyncUtils'

interface CachedRooms {
  rooms: RoomSummaryDto[]
  fetchedAt: number
}

interface RoomsState {
  listCache: Record<string, CachedRooms>
  detailsById: Record<string, RoomDetailsDto>
  isLoading: boolean
  error: string | null
  stale: boolean
}

const initialState: RoomsState = {
  listCache: {},
  detailsById: {},
  isLoading: false,
  error: null,
  stale: false,
}

const keyOf = (params: ListRoomsParams = {}) => params.status || 'all'

export const fetchRooms = createAsyncThunk<
  { key: string; rooms: RoomSummaryDto[]; fetchedAt: number },
  ListRoomsParams | undefined,
  { rejectValue: string }
>('rooms/fetch', async (params = {}, { rejectWithValue }) => {
  try {
    const response = await roomsApi.list(params)
    return { key: keyOf(params), rooms: response.rooms, fetchedAt: Date.now() }
  } catch (error) {
    return rejectWithValue(getErrorMessage(error, 'Не удалось загрузить комнаты.'))
  }
})

export const fetchRoomDetails = createAsyncThunk<RoomDetailsDto, string, { rejectValue: string }>(
  'rooms/fetchDetails',
  async (roomId, { rejectWithValue }) => {
    try {
      return await roomsApi.details(roomId)
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, 'Не удалось получить данные комнаты.'))
    }
  },
)

export const openRoom = createAsyncThunk<RoomDetailsDto, string, { rejectValue: string }>('rooms/open', async (roomId, { dispatch, rejectWithValue }) => {
  try {
    const room = await roomsApi.open(roomId)
    dispatch(invalidateRoomsCache())
    return room
  } catch (error) {
    return rejectWithValue(getErrorMessage(error, 'Не удалось открыть комнату.'))
  }
})

const roomsSlice = createSlice({
  name: 'rooms',
  initialState,
  reducers: {
    invalidateRoomsCache: (state) => {
      state.stale = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRooms.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchRooms.fulfilled, (state, action) => {
        state.isLoading = false
        state.listCache[action.payload.key] = {
          rooms: action.payload.rooms,
          fetchedAt: action.payload.fetchedAt,
        }
        state.stale = false
      })
      .addCase(fetchRooms.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload || 'Ошибка загрузки комнат.'
      })
      .addCase(fetchRoomDetails.fulfilled, (state, action) => {
        state.detailsById[action.payload.id] = action.payload
      })
      .addCase(fetchRoomDetails.rejected, (state, action) => {
        state.error = action.payload || 'Ошибка загрузки комнаты.'
      })
      .addCase(openRoom.fulfilled, (state, action) => {
        state.detailsById[action.payload.id] = action.payload
      })
  },
})

export const selectRoomsState = (state: RootState) => state.rooms
export const selectRoomsByStatus = (status: ListRoomsParams['status'] = 'all') => (state: RootState) =>
  state.rooms.listCache[status || 'all']?.rooms || []
export const selectRoomDetails = (roomId: string) => (state: RootState) => state.rooms.detailsById[roomId] || null

export const { invalidateRoomsCache } = roomsSlice.actions
export default roomsSlice.reducer
