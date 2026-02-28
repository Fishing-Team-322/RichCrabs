import type { Overview, RoomDetails, RoomsList } from './types'

const mockRooms: RoomsList = {
  rooms: [
    {
      roomId: 'CRAB-ALPHA',
      lifecycleState: 'LOBBY',
      wsConnections: 6,
      queueLen: 0,
      streamFinished: false,
      players: [
        { playerId: 'u-101', displayName: 'Dmitry', score: 12 },
        { playerId: 'u-102', displayName: 'Anna', score: 9 },
      ],
    },
    {
      roomId: 'CRAB-BETA',
      lifecycleState: 'IN_GAME',
      wsConnections: 10,
      queueLen: 1,
      streamFinished: false,
      players: [
        { playerId: 'u-201', displayName: 'Marina', score: 16 },
        { playerId: 'u-202', displayName: 'Ivan', score: 13 },
        { playerId: 'u-203', displayName: 'Leo', score: 10 },
      ],
    },
  ],
}

export const mockOverview = (): Overview => ({
  activeRooms: mockRooms.rooms.length,
  wsConnections: mockRooms.rooms.reduce((acc, room) => acc + (room.wsConnections || 0), 0),
  wsQueueDrops: 0,
  grpcHealth: true,
})

export const mockRoomsList = (): RoomsList => ({
  rooms: mockRooms.rooms.map((room) => ({ ...room, players: [...(room.players || [])] })),
})

export const mockRoomDetails = (roomId: string): RoomDetails => {
  const room = mockRooms.rooms.find((entry) => entry.roomId === roomId) ?? mockRooms.rooms[0]

  return {
    roomId: room.roomId,
    lifecycleState: room.lifecycleState || 'UNKNOWN',
    players: [...(room.players || [])],
    currentQuestionId: room.lifecycleState === 'IN_GAME' ? 'q-5' : undefined,
  }
}
