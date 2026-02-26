import { useMemo, useState } from "react";
import { Layout } from "./components/Layout";
import type { RouteKey } from "./components/Layout";
import { TokenModal } from "./components/TokenModal";
import { setToken } from "./api";
import { DashboardPage } from "./pages/Dashboard";
import { SecurityPage } from "./pages/Security";

export default function App() {
  const [route, setRoute] = useState<RouteKey>("dashboard");

  const [statusOk, setStatusOk] = useState(false);
  const [statusText, setStatusText] = useState("…");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const [totRooms, setTotRooms] = useState(0);
  const [totPlayers, setTotPlayers] = useState(0);

  const [tokenOpen, setTokenOpen] = useState(false);

  const updatedLabel = useMemo(() => {
    if (!updatedAt) return "—";
    const sec = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
    if (sec < 5) return "just now";
    if (sec < 60) return `${sec}s ago`;
    return `${Math.floor(sec / 60)}m ago`;
  }, [updatedAt]);

  function onStatus(ok: boolean, text: string, at: number | null) {
    setStatusOk(ok);
    setStatusText(text);
    setUpdatedAt(at);
  }

  return (
    <>
      <Layout
        route={route}
        onRoute={setRoute}
        statusOk={statusOk}
        statusText={statusText}
        updatedLabel={updatedLabel}
        totalsRooms={totRooms}
        totalsPlayers={totPlayers}
        onOpenToken={() => setTokenOpen(true)}
      >
        {route === "dashboard" ? (
          <DashboardPage
            onStatus={onStatus}
            onTotals={(r, p) => {
              setTotRooms(r);
              setTotPlayers(p);
            }}
          />
        ) : (
          <SecurityPage onStatus={onStatus} />
        )}
      </Layout>

      <TokenModal
        open={tokenOpen}
        onClose={() => setTokenOpen(false)}
        onSave={(t) => {
          setToken(t);
          setTokenOpen(false);
        }}
      />
    </>
  );
}