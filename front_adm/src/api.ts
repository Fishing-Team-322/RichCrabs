import type { Overview, RoomsList, RoomDetails } from "./types";

function getToken(): string {
  return localStorage.getItem("admin_token") || "";
}

export function setToken(t: string) {
  localStorage.setItem("admin_token", t);
}

async function fetchJson<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${txt || "request failed"}`);
  }

  return (await res.json()) as T;
}

export const api = {
  overview: () => fetchJson<Overview>("/admin/api/overview"),
  rooms: () => fetchJson<RoomsList>("/admin/api/rooms"),
  room: (id: string) => fetchJson<RoomDetails>(`/admin/api/rooms/${encodeURIComponent(id)}`),
};