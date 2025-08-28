import { useEffect } from "react";
import type { Socket } from "socket.io-client";

export function useHeartbeat(socket: Socket | null, intervalMs = 10000) {
  useEffect(() => {
    if (!socket) return;
    let t: any;
    const beat = () => socket.emit("heartbeat", { t: Date.now() });
    beat();
    t = setInterval(beat, intervalMs);
    return () => clearInterval(t);
  }, [socket, intervalMs]);
}
