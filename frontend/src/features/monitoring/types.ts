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

export type SecurityOverview = {
  windowSec: number;
  rateLimitHits: number;
  invalidJoinTickets: number;
  replayDetected: number;
  suspiciousBursts: number;
  wsQueueDrops: number;
};

export type SecurityEventType =
  | 'rate_limit'
  | 'invalid_ticket'
  | 'replay'
  | 'suspicious_burst'
  | 'bad_webhook_secret'
  | 'ws_queue_drop';

export type SecurityEvent = {
  ts: string;
  type: SecurityEventType;
  severity: 'low' | 'med' | 'high';
  roomId?: string;
  ip?: string;
  deviceKey?: string;
  message: string;
};

export type SecurityEventsResponse = {
  events: SecurityEvent[];
};
