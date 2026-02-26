import type {
  Overview,
  RoomsList,
  RoomDetails,
  SecurityOverview,
  SecurityEventsResponse,
} from "./types";

function getToken(): string {
  return localStorage.getItem("admin_token") || "";
}

export function setToken(t: string) {
  localStorage.setItem("admin_token", t);
}

/**
 * Более безопасный fetch:
 * - читает body как text
 * - пытается распарсить JSON
 * - если пришёл HTML/текст (часто 404/502) — выдаёт нормальную ошибку
 */
async function fetchJson<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 140)}`);
  }

  // пробуем JSON
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 140)}`);
  }
}

export const api = {
  overview: () => fetchJson<Overview>("/admin/api/overview"),
  rooms: () => fetchJson<RoomsList>("/admin/api/rooms"),
  room: (id: string) => fetchJson<RoomDetails>(`/admin/api/rooms/${encodeURIComponent(id)}`),

  // security endpoints (потом подключите на бэке)
  securityOverview: () => fetchJson<SecurityOverview>("/admin/api/security/overview"),
  securityEvents: (limit = 40) =>
    fetchJson<SecurityEventsResponse>(`/admin/api/security/events?limit=${limit}`),
};