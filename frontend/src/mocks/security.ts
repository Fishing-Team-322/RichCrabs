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
  const type = sample(TYPES);
  const severity = sample(['low', 'med', 'high'] as const);
  return Array.from({ length: limit }).map(() => {
    return {
      type,
      severity,
      roomid: sample([undefined, 'RM-1001-42', 'RM-1003-19', 'RM-1010-88']) as string | undefined,
      deviceKey: sample([undefined, 'devk_8f12', 'devk_19ad', 'devk_z231']) as string | undefined,
      message: sample([
        'Join throttled (too many attempts)',
        'Invalid ticket',
        'Replay attempt (ticket already used)',
        'Suspicious burst join pattern detected',
        'WS outbound queue drop (backpressure)',
      ]) as string,
    };
  });
}

  // сортируем по времени, свежие сверху
  events.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return { events };
}