import React from "react";
import { IconGrid, IconKey, IconRooms, IconShield } from "./Icons";

function cn(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

export type RouteKey = "dashboard" | "security";

export function Layout(props: {
  route: RouteKey;
  onRoute: (r: RouteKey) => void;

  statusOk: boolean;
  statusText: string;
  updatedLabel: string;

  totalsRooms: number;
  totalsPlayers: number;

  onOpenToken: () => void;

  children: React.ReactNode;
}) {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo"><div className="logoDot" /></div>
          <div className="brandText">
            <div className="brandTitle">Watchtower</div>
            <div className="brandSub">QuizBattle Admin</div>
          </div>
        </div>

        <nav className="nav">
          <div
            className={cn("navItem", props.route === "dashboard" && "active")}
            onClick={() => props.onRoute("dashboard")}
          >
            <IconGrid />
            <span>Dashboard</span>
          </div>

          <div
            className={cn("navItem", props.route === "security" && "active")}
            onClick={() => props.onRoute("security")}
          >
            <IconShield />
            <span>Security</span>
          </div>

          <div className="navItem" style={{ opacity: 0.65 }}>
            <IconRooms />
            <span>Rooms</span>
            <span className="chip">soon</span>
          </div>
        </nav>

        <div className="sidebarBottom">
          <div className="miniStat">
            <div className="miniK">Rooms</div>
            <div className="miniV">{props.totalsRooms}</div>
          </div>

          <div className="miniStat">
            <div className="miniK">Players</div>
            <div className="miniV">{props.totalsPlayers}</div>
          </div>

          <button className="btn ghost" onClick={props.onOpenToken}>
            <IconKey />
            Token
          </button>

          <div className={cn("statusPill", props.statusOk ? "ok" : "bad")}>
            <span className="dot" />
            <span className="statusText">{props.statusText}</span>
            <span className="statusTime">{props.updatedLabel}</span>
          </div>
        </div>
      </aside>

      <main className="main">
        {props.children}
      </main>
    </div>
  );
}