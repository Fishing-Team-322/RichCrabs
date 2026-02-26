
import type { RoomRow } from "../types";
import { IconArrow } from "./Icons";

export function RoomsTable(props: {
  rooms: RoomRow[];
  loading: boolean;
  onOpenRoom: (roomId: string) => void;
}) {
  return (
    <div className="tableWrap">
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 240 }}>RoomId</th>
            <th style={{ width: 160 }}>State</th>
            <th style={{ width: 110, textAlign: "right" }}>Players</th>
            <th style={{ width: 120, textAlign: "right" }}>WS</th>
            <th style={{ width: 110, textAlign: "right" }}>Queue</th>
            <th style={{ width: 110 }} />
          </tr>
        </thead>
        <tbody>
          {props.loading && props.rooms.length === 0 ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : props.rooms.length === 0 ? (
            <tr>
              <td colSpan={6} className="empty">
                No rooms found. Try clearing filters.
              </td>
            </tr>
          ) : (
            props.rooms.map((r) => {
              const pCount = r.players?.length ?? 0;
              const badge = badgeFromState(r.lifecycleState);
              return (
                <tr key={r.roomId}>
                  <td className="mono"><span className="roomId">{r.roomId}</span></td>
                  <td><span className={`badge ${badge.tone}`}>{badge.label}</span></td>
                  <td style={{ textAlign: "right" }}><span className="num">{pCount}</span></td>
                  <td style={{ textAlign: "right" }}><span className="num">{r.wsConnections ?? 0}</span></td>
                  <td style={{ textAlign: "right" }}><span className="num">{r.queueLen ?? 0}</span></td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn small" onClick={() => props.onOpenRoom(r.roomId)}>
                      View <IconArrow />
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr>
      <td colSpan={6} style={{ padding: 0 }}>
        <div className="skeletonRow" />
      </td>
    </tr>
  );
}

function badgeFromState(state?: string) {
  const s = (state || "").toLowerCase();
  if (s.includes("lobby")) return { label: "Lobby", tone: "info" };
  if (s.includes("game") || s.includes("play") || s.includes("in_game")) return { label: "In-game", tone: "ok" };
  if (s.includes("finish") || s.includes("done")) return { label: "Finished", tone: "muted" };
  return { label: state ? state : "—", tone: "muted" };
}