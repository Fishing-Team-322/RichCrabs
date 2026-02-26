export type Overview = {
  activeRooms: number;
  wsConnections: number;
  wsQueueDrops: number;
  grpcHealth: boolean;
};

export type Player = {
  playerId: string;
  displayName: string;
  score?: number;
};

export type RoomRow = {
  roomId: string;
  lifecycleState?: string;
  wsConnections?: number;
  queueLen?: number;
  streamFinished?: boolean;
  players?: Player[];
};

export type RoomsList = {
  rooms: RoomRow[];
};

export type RoomDetails = {
  roomId: string;
  lifecycleState: string;
  currentQuestionId?: string;
  players: Player[];
};