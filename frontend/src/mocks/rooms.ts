import type { Overview, RoomsList, RoomDetails } from "../types";

function rnd(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sample<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function mockOverview(): Overview {
  return {
    activeRooms: rnd(2, 14),
    wsConnections: rnd(15, 160),
    wsQueueDrops: rnd(0, 6),
    grpcHealth: true,
  };
}

export function mockRooms(): RoomsList {
  const states = ["lobby", "in_game", "finished"];
  const roomsCount = rnd(3, 10);

  const rooms = Array.from({ length: roomsCount }).map((_, i) => {
    const players = rnd(2, 10);
    return {
      roomId: `RM-${1000 + i}-${rnd(10, 99)}`,
      lifecycleState: sample(states),
      wsConnections: players + rnd(0, 4),
      queueLen: rnd(0, 3),
      streamFinished: false,
      players: Array.from({ length: players }).map((__, pi) => ({
        playerId: `p-${i}-${pi}-${rnd(100, 999)}`,
        displayName: sample(["Den", "Alex", "Mira", "Nika", "Sanya", "Vlad", "Ilya"]) + `#${rnd(10, 99)}`,
        score: rnd(0, 18),
      })),
    };
  });

  return { rooms };
}

export function mockRoomDetails(roomId: string): RoomDetails {
  const players = rnd(3, 10);
  return {
    roomId,
    lifecycleState: sample(["lobby", "in_game", "finished"]),
    currentQuestionId: `q-${rnd(1, 12)}`,
    players: Array.from({ length: players }).map((_, i) => ({
      playerId: `p-${roomId}-${i}-${rnd(100, 999)}`,
      displayName: sample(["Den", "Alex", "Mira", "Nika", "Sanya", "Vlad", "Ilya"]) + `#${rnd(10, 99)}`,
      score: rnd(0, 25),
    })),
  };
}