import type { SecurityEvent, SecurityEventsResponse, SecurityOverview, SecurityEventType } from "../types";

function rnd(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sample<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function isoNowMinusSec(sec: number) {
  return new Date(Date.now() - sec * 1000).toISOString();
}

const TYPES: SecurityEventType[] = ["rate_limit", "invalid_ticket", "replay", "suspicious_burst", "ws_queue_drop"];

export function mockSecurityOverview(): SecurityOverview {
  return {
    windowSec: 300,
    rateLimitHits: rnd(5, 120),
    invalidJoinTickets: rnd(1, 40),
    replayDetected: rnd(0, 12),
    suspiciousBursts: rnd(0, 7),
    wsQueueDrops: rnd(0, 8),
  };
}

export function mockSecurityEvents(limit = 40): SecurityEventsResponse {
  const events: SecurityEvent[] = Array.from({ length: limit }).map((_, i) => {
    const type = sample(TYPES);
    const severity = sample(["low", "med", "high"] as const);
    return {
      ts: isoNowMinusSec(rnd(5, 300)),
      type,
      severity,
      roomId: sample([undefined, "RM-1001-42", "RM-1003-19", "RM-1010-88"]),
      ip: sample([undefined, "10.0.0.12", "10.0.1.5", "192.168.0.22"]),
      deviceKey: sample([undefined, "devk_8f12", "devk_19aa", "devk_zz31"]),
      message:
        type === "rate_limit"
          ? "Join throttled (too many attempts)"
          : type === "invalid_ticket"
          ? "Join ticket invalid/expired"
          : type === "replay"
          ? "Replay attempt (ticket already used)"
          : type === "suspicious_burst"
          ? "Burst join pattern detected"
          : "WS outbound queue drop (backpressure)",
    };
  });

  // сортируем по времени, свежие сверху
  events.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return { events };
}