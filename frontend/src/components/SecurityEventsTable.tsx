
import type { SecurityEvent } from "../types";

export function SecurityEventsTable(props: { events: SecurityEvent[]; loading: boolean }) {
  return (
    <div className="tableWrap">
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 170 }}>Time</th>
            <th style={{ width: 140 }}>Type</th>
            <th style={{ width: 110 }}>Severity</th>
            <th style={{ width: 160 }}>Room</th>
            <th style={{ width: 140 }}>IP</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          {props.loading && props.events.length === 0 ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : props.events.length === 0 ? (
            <tr>
              <td colSpan={6} className="empty">No security events yet.</td>
            </tr>
          ) : (
            props.events.map((e, idx) => (
              <tr key={idx}>
                <td className="mono">{fmtTime(e.ts)}</td>
                <td><span className={`badge ${badgeTone(e.type)}`}>{e.type}</span></td>
                <td><span className={`badge ${sevTone(e.severity)}`}>{e.severity}</span></td>
                <td className="mono">{e.roomId ?? "—"}</td>
                <td className="mono">{e.ip ?? "—"}</td>
                <td>{e.message}</td>
              </tr>
            ))
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

function fmtTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString();
}

function badgeTone(type: string) {
  if (type.includes("rate")) return "info";
  if (type.includes("invalid")) return "orange";
  if (type.includes("replay")) return "red";
  if (type.includes("burst")) return "violet";
  if (type.includes("ws")) return "muted";
  return "muted";
}

function sevTone(sev: string) {
  if (sev === "high") return "red";
  if (sev === "med") return "orange";
  return "muted";
}