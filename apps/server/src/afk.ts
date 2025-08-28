import type { Server, Socket } from "socket.io";

type GetPlayerCtx = (socket: Socket) => { roomCode: string | null; playerId: string | null };
type SetReady = (roomCode: string, playerId: string, ready: boolean) => void;

export function installAfk(io: Server, getCtx: GetPlayerCtx, setReady: SetReady, idleMs = 45000, tickMs = 10000) {
  const lastSeen = new Map<string, number>(); // socket.id -> ts

  io.on("connection", (socket) => {
    lastSeen.set(socket.id, Date.now());

    socket.on("heartbeat", () => lastSeen.set(socket.id, Date.now()));

    socket.on("disconnect", () => {
      lastSeen.delete(socket.id);
    });
  });

  setInterval(() => {
    const now = Date.now();
    for (const [sid, ts] of [...lastSeen.entries()]) {
      if (now - ts > idleMs) {
        const s = io.sockets.sockets.get(sid);
        if (!s) { lastSeen.delete(sid); continue; }
        const { roomCode, playerId } = getCtx(s);
        if (roomCode && playerId) {
          // hazırdan düşür
          setReady(roomCode, playerId, false);
          // oyuncuya uyarı
          s.emit("afk_warning", { idleMs });
        }
        lastSeen.set(sid, now); // bir kere düşür, sonra tekrar say
      }
    }
  }, tickMs);
}
