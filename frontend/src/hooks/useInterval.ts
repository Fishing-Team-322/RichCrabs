import { useEffect, useRef } from "react";

export function useInterval(cb: () => void, delayMs: number | null) {
  const ref = useRef(cb);
  ref.current = cb;

  useEffect(() => {
    if (delayMs === null) return;
    const id = window.setInterval(() => ref.current(), delayMs);
    return () => window.clearInterval(id);
  }, [delayMs]);
}