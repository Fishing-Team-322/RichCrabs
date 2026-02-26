
import type { RoomDetails } from "../types";
import { IconX } from "./Icons";

function cn(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

export function Drawer(props: {
  open: boolean;
  loading: boolean;
  details: RoomDetails | null;
  onClose: () => void;
}) {
  return (
    <>
      <div className={cn("drawerOverlay", props.open && "open")} onMouseDown={props.onClose} />
      <aside className={cn("drawer", props.open && "open")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawerHead">
          <div>
            <div className="drawerTitle">Room details</div>
            <div className="drawerSub">Live snapshot</div>
          </div>
          <button className="iconBtn" onClick={props.onClose} aria-label="Close">
            <IconX />
          </button>
        </div>

        {props.loading ? (
          <div className="drawerBody">
            <div className="skeletonCard" />
            <div className="skeletonCard" />
            <div className="skeletonCard" />
          </div>
        ) : props.details ? (
          <div className="drawerBody">
            <div className="detailGrid">
              <div className="detailCard">
                <div className="k">Room</div>
                <div className="v mono">{props.details.roomId}</div>
              </div>
              <div className="detailCard">
                <div className="k">State</div>
                <div className="v">{props.details.lifecycleState}</div>
              </div>
              <div className="detailCard">
                <div className="k">Players</div>
                <div className="v">{props.details.players.length}</div>
              </div>
            </div>

            <div className="sectionTitle">Players</div>
            <div className="players">
              {props.details.players
                .slice()
                .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                .map((p, idx) => (
                  <div className="playerRow" key={p.playerId}>
                    <div className="rank">{idx + 1}</div>
                    <div className="pMain">
                      <div className="pName">{p.displayName}</div>
                      <div className="pId mono">{p.playerId}</div>
                    </div>
                    <div className="pScore">{p.score ?? 0}</div>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <div className="drawerBody">
            <div className="emptyCard">No details loaded.</div>
          </div>
        )}
      </aside>
    </>
  );
}