import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { io, Socket } from "socket.io-client";

type Team = "cacik" | "cucuk";
interface Player { id:string; name:string; team:Team|null; ready:boolean }
interface Snapshot {
  code: string;
  status: "lobby"|"running"|"over";
  players: Player[];
  teams: { cacik: Player[]; cucuk: Player[] };
  canStart: boolean;
  reason?: string;
  scores?: { cacik:number; cucuk:number };
  turnIndex?: number;
  totalTurns?: number;
}

/* ===== Brush & Canvas tipleri ===== */
type Brush = { color:string; w:number; tool:"pen"|"eraser" };
type Pt = { x:number; y:number; t?:number };
type Stroke = { brush: Brush; points: Pt[] };

type CanvasBoardHandle = {
  // local actions (çizer kullanır)
  localBrushChange: (p:{color?:string; w?:number; tool?: "pen"|"eraser"})=>void;
  localClear: ()=>void;
  localUndo: ()=>void;

  // remote sync (sunucudan gelen olaylar)
  remoteStrokeBegin: (p:any)=>void;
  remoteStrokePoint: (p:any)=>void;
  remoteStrokeEnd: (p:any)=>void;
  remoteBrushChange: (p:any)=>void;
  remoteClear: ()=>void;
  remoteUndo: ()=>void;
};

const isBrowser = typeof window !== "undefined";
const BTN = { padding:"14px 16px", fontSize:18, borderRadius:10, border:"1px solid #ccc", minHeight:48, background:"#fafafa", transition:"transform 60ms ease, box-shadow .2s, border-color .2s, background .2s" } as const;

export default function Home() {
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("czk1");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [myId, setMyId] = useState<string | null>(null);

  // Aktif fırça durumu (UI highlight için)
  const [brush, setBrush] = useState<Brush>({ color:"#111", w:4, tool:"pen" });

  const [autojoin, setAutojoin] = useState<boolean>(() => {
    if (!isBrowser) return false;
    return sessionStorage.getItem("czk_autojoin") === "1";
  });

  useEffect(() => {
    if (!isBrowser) return;
    const n = localStorage.getItem("czk_name");
    const r = localStorage.getItem("czk_room");
    if (n) setName(n);
    if (r) setRoomCode(r);
    try {
      const u = new URL(window.location.href);
      const rp = u.searchParams.get("room");
      if (rp) setRoomCode(rp);
    } catch {}
  }, []);

  // Faz durumları
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);

  // Kelime seçenekleri
  const [wordOptions, setWordOptions] = useState<string[] | null>(null);
  const [lastOptions, setLastOptions] = useState<string[] | null>(null);
  const [wordPickDeadline, setWordPickDeadline] = useState<number | null>(null);
  const [votedIndex, setVotedIndex] = useState<number | null>(null);

  // Çizim
  const [secretWord, setSecretWord] = useState<string | null>(null);
  const [drawDeadline, setDrawDeadline] = useState<number | null>(null);

  // Tahmin
  const [guessOptions, setGuessOptions] = useState<string[] | null>(null);
  const [guessDeadline, setGuessDeadline] = useState<number | null>(null);
  const [guessedIndex, setGuessedIndex] = useState<number | null>(null);

  // Sonuç
  const [lastResult, setLastResult] = useState<{ correctIndex:number; teamScores:{cacik:number; cucuk:number}; delta?:{cacik:number;cucuk:number}; correctGuessers?:string[]; wrongGuessers?:string[] } | null>(null);

  // Canvas ref
  const canvasRef = useRef<CanvasBoardHandle | null>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";
    const s = io(url, { transports: ["websocket","polling"] });
    setSocket(s);

    s.on("connect", () => {
      setMyId(s.id);
      if (isBrowser && sessionStorage.getItem("czk_autojoin") === "1") {
        const storedName = localStorage.getItem("czk_name") || name;
        const storedRoom = localStorage.getItem("czk_room") || roomCode;
        s.emit("join_room", { roomCode: storedRoom || "czk1", name: (storedName || "").trim() || "Oyuncu" });
      }
    });

    s.on("connect_error", (err) => {
      console.error("[socket] connect_error", err);
      alert("Socket bağlanamadı: " + (err?.message || err));
    });

    s.on("room_snapshot", (data: Snapshot) => setSnap(data));
    s.on("start_countdown", ({ t }: { t:number }) => setCountdown(t));
    s.on("match_started", () => {
      setCountdown(null);
      setLastResult(null);
      setWordOptions(null);
      setSecretWord(null);
      setGuessOptions(null);
      setVotedIndex(null);
      setGuessedIndex(null);
    });

    s.on("turn_setup_public", ({ drawerId, team }) => {
      setDrawerId(drawerId);
      setActiveTeam(team);
      setLastResult(null);
      setVotedIndex(null);
      setGuessedIndex(null);
      setSecretWord(null);
      setGuessOptions(null);
    });

    s.on("word_options", ({ options, deadline }) => {
      setWordOptions(options);
      setLastOptions(options);
      setWordPickDeadline(deadline);
      setVotedIndex(null);
    });

    s.on("secret_word", ({ word, deadline }) => {
      setSecretWord(word);
      setDrawDeadline(deadline);
    });

    s.on("draw_start", ({ drawerId, team, options, deadline }) => {
      setDrawerId(drawerId);
      setActiveTeam(team);
      setWordOptions(options);
      setLastOptions(options);
      setWordPickDeadline(null);
      setDrawDeadline(deadline);
    });

    s.on("guess_phase", ({ options, deadline }) => {
      setGuessOptions(options);
      setGuessDeadline(deadline);
      setGuessedIndex(null);
    });

    s.on("turn_result", (payload) => {
      setLastResult(payload);
      setWordOptions(null);
      setSecretWord(null);
      setGuessOptions(null);
      setDrawDeadline(null);
      setGuessDeadline(null);
    });

    s.on("game_over", (payload) => {
      alert(`Oyun bitti! Skor — Cacık: ${payload.scores.cacik} | Cücük: ${payload.scores.cucuk}`);
    });

    // Çizim relays
    s.on("stroke_begin", (p:any) => canvasRef.current?.remoteStrokeBegin(p));
    s.on("stroke_point", (p:any) => canvasRef.current?.remoteStrokePoint(p));
    s.on("stroke_end", (p:any) => canvasRef.current?.remoteStrokeEnd(p));
    s.on("brush_change", (p:any) => canvasRef.current?.remoteBrushChange(p));
    s.on("canvas_clear", () => canvasRef.current?.remoteClear());
    s.on("undo", () => canvasRef.current?.remoteUndo());

    return () => { s.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Heartbeat
  useEffect(() => {
    if (!socket) return;
    const beat = () => socket.emit("heartbeat", { t: Date.now() });
    beat();
    const t = setInterval(beat, 10_000);
    return () => clearInterval(t);
  }, [socket]);

  // UI canlı sayaç
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 250);
    return () => clearInterval(t);
  }, []);

  // Wake Lock
  const [wakelock, setWakelock] = useState(false);
  const wakeLockRef = useRef<any>(null);
  async function requestWakeLock() {
    try {
      // @ts-ignore
      if (navigator?.wakeLock?.request) {
        // @ts-ignore
        const lock = await navigator.wakeLock.request("screen");
        wakeLockRef.current = lock;
        setWakelock(true);
        lock.addEventListener("release", () => setWakelock(false));
        document.addEventListener("visibilitychange", async () => {
          if (document.visibilityState === "visible" && wakelock) {
            try {
              // @ts-ignore
              wakeLockRef.current = await navigator.wakeLock.request("screen");
            } catch {}
          }
        });
      }
    } catch (e) {
      console.warn("WakeLock err", e);
    }
  }
  function releaseWakeLock() {
    try { wakeLockRef.current?.release?.(); } catch {}
    setWakelock(false);
  }

  const joined = !!snap;
  const join = () => {
    const safeName = (name || "").trim() || "Oyuncu";
    if (isBrowser) {
      sessionStorage.setItem("czk_autojoin", "1");
      localStorage.setItem("czk_name", safeName);
      localStorage.setItem("czk_room", roomCode);
    }
    setAutojoin(true);
    setBrush({ color:"#111", w:4, tool:"pen" }); // başlangıç
    socket?.emit("join_room", { roomCode, name: safeName });
  };
  const leaveRoom = () => {
    if (isBrowser) sessionStorage.removeItem("czk_autojoin");
    setBrush({ color:"#111", w:4, tool:"pen" });
    setSnap(null);
    try { socket?.disconnect(); } catch {}
    if (isBrowser) window.location.href = window.location.origin;
  };

  const pickTeam = (team:Team) => socket?.emit("switch_team", { team });
  const toggleReady = () => socket?.emit("toggle_ready");

  const me: Player | undefined = snap?.players.find(p => p.id === myId);
  const myTeam = me?.team ?? null;
  const amDrawer = myId && drawerId === myId;

  function voteWord(i:number) {
    if (!socket || votedIndex !== null) return;
    setVotedIndex(i);
    socket.emit("word_vote", { optionIndex: i });
  }
  function submitGuess(i:number) {
    if (!socket || guessedIndex !== null) return;
    setGuessedIndex(i);
    socket.emit("guess_submit", { optionIndex: i });
  }

  const now = Date.now();
  const wordLeft = wordPickDeadline ? Math.max(0, Math.ceil((wordPickDeadline - now)/1000)) : null;
  const drawLeft = drawDeadline ? Math.max(0, Math.ceil((drawDeadline - now)/1000)) : null;
  const guessLeft = guessDeadline ? Math.max(0, Math.ceil((guessDeadline - now)/1000)) : null;

  const totalTurns = snap?.totalTurns ?? 0;
  const turnIdx = snap?.turnIndex ?? 0;
  const progress = totalTurns > 0 ? Math.min(1, Math.max(0, (turnIdx) / totalTurns)) : 0;

  const delta = lastResult?.delta || { cacik: 0, cucuk: 0 };

  function buildRoomUrl(code:string) {
    const origin = isBrowser ? window.location.origin : (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000");
    return `${origin}/?room=${encodeURIComponent(code)}`;
  }
  async function copyLink() {
    const url = buildRoomUrl(snap?.code || roomCode);
    try { await navigator.clipboard.writeText(url); alert("Oda linki kopyalandı!"); }
    catch { prompt("Kopyalayın:", url); }
  }
  async function nativeShare() {
    const url = buildRoomUrl(snap?.code || roomCode);
    // @ts-ignore
    if (navigator?.share) {
      try {
        // @ts-ignore
        await navigator.share({ title:"Çiziko", text:`Çiziko odası: ${snap?.code || roomCode}`, url });
      } catch {}
    } else {
      copyLink();
    }
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 16, maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 8 }}>Çiziko</h1>

      <ScoreBar scores={snap?.scores || { cacik:0, cucuk:0 }} delta={delta} />
      <ProgressBar progress={progress} label={`Tur ${turnIdx}/${totalTurns}`} />

      {!joined && (
        <div style={{ display: "grid", gap: 8, maxWidth: 420, marginTop: 12 }}>
          <label>
            İsim
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Adın" style={{ width:"100%", height:44, fontSize:16 }} />
          </label>
          <label>
            Oda Kodu
            <input value={roomCode} onChange={e=>setRoomCode(e.target.value)} placeholder="örn: czk1" style={{ width:"100%", height:44, fontSize:16 }} />
          </label>
          <button onClick={join} style={{ ...BTN, borderColor:"#999" }}>Odaya Katıl</button>
          <div style={{ display:"flex", gap:8, alignItems:"center", justifyContent:"space-between" }}>
            <p style={{opacity:.7, margin:0}}>Sunucu: {process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000"}</p>
            {!wakelock ? (
              <button onClick={requestWakeLock} title="Ekranı açık tut" style={{ ...BTN, padding:"10px 12px", fontSize:14 }}>🔋 Ekranı Açık Tut</button>
            ) : (
              <button onClick={releaseWakeLock} title="Ekran korumasını kapat" style={{ ...BTN, padding:"10px 12px", fontSize:14 }}>🔒 Kapat</button>
            )}
          </div>
        </div>
      )}

      {joined && snap && (
        <>
          <div style={{ display:"flex", gap: 12, alignItems:"center", flexWrap:"wrap", marginTop: 10 }}>
            <strong>Oda:</strong> <code>{snap.code}</code>
            <button onClick={copyLink} style={{ ...BTN, padding:"8px 10px", fontSize:14 }}>🔗 Kopyala</button>
            <button onClick={nativeShare} style={{ ...BTN, padding:"8px 10px", fontSize:14 }}>📤 Paylaş</button>
            <span>Durum: <b>{snap.status}</b></span>
            {countdown !== null && <span style={{ fontSize: 20, fontWeight:600 }}>Başlıyor: {countdown}</span>}
            <span>Ben: {me?.name} ({myTeam ?? "?"}) {amDrawer ? "✏️ Çizer" : ""}</span>
            <div style={{ display:"flex", gap:8, marginLeft:"auto" }}>
              {!wakelock ? (
                <button onClick={requestWakeLock} title="Ekranı açık tut" style={{ ...BTN, padding:"8px 10px", fontSize:14 }}>🔋 Açık Tut</button>
              ) : (
                <button onClick={releaseWakeLock} title="Kapat" style={{ ...BTN, padding:"8px 10px", fontSize:14 }}>🔒 Kapat</button>
              )}
              <button onClick={leaveRoom} style={{ ...BTN, padding:"8px 10px", fontSize:14 }}>Çık / İsim Değiştir</button>
            </div>
          </div>

          {/* Lobi alanı */}
          {snap.status === "lobby" && (
            <>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap: 16, marginTop: 16 }}>
                <TeamCard title={`Cacık (${snap.teams.cacik.length})`} players={snap.teams.cacik} onClick={()=>pickTeam("cacik")} color="#2ecc71"/>
                <TeamCard title={`Cücük (${snap.teams.cucuk.length})`} players={snap.teams.cucuk} onClick={()=>pickTeam("cucuk")} color="#e67e22"/>
              </div>

              <div style={{ marginTop: 16, display:"flex", gap: 12, alignItems:"center" }}>
                <button onClick={toggleReady} style={{ ...BTN }}>Hazırım</button>
                <span>{snap.canStart ? "Başlamaya hazır!" : (snap.reason || "")}</span>
              </div>
            </>
          )}

          {/* Maç alanı */}
          {snap.status === "running" && (
            <div style={{ marginTop: 16 }}>
              {/* Kelime seçimi (yalnız rakip takım) */}
              {wordOptions && wordLeft !== null && myTeam && activeTeam && myTeam !== activeTeam && (
                <div style={{ border:"2px dashed #999", padding:12, borderRadius:8, marginBottom:12 }}>
                  <h3>Kelimeyi Seç (Rakip Takım) — Kalan: {wordLeft}s</h3>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap: 8 }}>
                    {wordOptions.map((w, i) => (
                      <button key={i}
                        onClick={()=>voteWord(i)}
                        disabled={votedIndex !== null}
                        style={{ ...BTN }}>
                        {w} {votedIndex === i ? "✅" : ""}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Çizim alanı (herkes) */}
              {drawLeft !== null && (
                <div style={{ border:"2px solid #444", borderRadius:8, padding:12, marginBottom:12 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <h3 style={{ margin:0 }}>Çizim — Kalan: {drawLeft}s</h3>
                    <div>Çizer: <b>{displayNameOf(drawerId, snap.players)}</b> ({activeTeam})</div>
                  </div>

                  <CanvasBoard
                    ref={canvasRef}
                    enabled={Boolean(amDrawer)}
                    socket={socket}
                  />

                  {/* fırça araçları (sadece çizer) */}
                  {amDrawer && (
                    <BrushToolbar
                      brush={brush}
                      onAction={(action, payload) => {
                        if (!socket) return;
                        // önce lokali uygula:
                        if (action === "clear")  canvasRef.current?.localClear();
                        if (action === "undo")   canvasRef.current?.localUndo();
                        if (action === "brush")  {
                          const next = { ...brush, ...payload };
                          setBrush(next); // UI highlight
                          canvasRef.current?.localBrushChange(payload);
                        }
                        // sonra odaya yayınla:
                        if (action === "clear")  socket.emit("canvas_clear");
                        if (action === "undo")   socket.emit("undo");
                        if (action === "brush")  socket.emit("brush_change", payload);
                      }}
                    />
                  )}

                  {/* Çizere gizli kelime etiketi */}
                  {amDrawer && secretWord && (
                    <div style={{ marginTop:8, fontStyle:"italic", opacity:.8 }}>Gizli kelime: <b>{secretWord}</b></div>
                  )}
                </div>
              )}

              {/* Tahmin paneli (çizen takım & çizer hariç) */}
              {guessOptions && guessLeft !== null && myTeam && activeTeam === myTeam && !amDrawer && (
                <div style={{ border:"2px dashed #666", padding:12, borderRadius:8, marginBottom:12 }}>
                  <h3>Tahmin Et — Kalan: {guessLeft}s</h3>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap: 8 }}>
                    {guessOptions.map((w, i) => (
                      <button key={i}
                        onClick={()=>submitGuess(i)}
                        disabled={guessedIndex !== null}
                        style={{ ...BTN }}>
                        {w} {guessedIndex === i ? "✅" : ""}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Tur sonucu */}
              {lastResult && (
                <div style={{ padding:12, background:"#f7f7f7", borderRadius:8 }}>
                  <div>Doğru seçenek: <b>{(lastOptions ?? [])[lastResult.correctIndex]}</b></div>
                  <div>
                    Skor — Cacık: <b>{lastResult.teamScores.cacik}</b> {delta.cacik ? <small style={{color: delta.cacik>0?"#2ecc71":"#e74c3c"}}>({delta.cacik>0?"+":""}{delta.cacik})</small> : null}
                    {" "} | Cücük: <b>{lastResult.teamScores.cucuk}</b> {delta.cucuk ? <small style={{color: delta.cucuk>0?"#2ecc71":"#e74c3c"}}>({delta.cucuk>0?"+":""}{delta.cucuk})</small> : null}
                  </div>

                  {lastResult?.correctGuessers?.length ? (
                    <div style={{opacity:.8, marginTop:6}}>
                      Doğru: {lastResult.correctGuessers.join(", ")}
                      {lastResult.wrongGuessers?.length ? ` · Yanlış: ${lastResult.wrongGuessers.join(", ")}` : null}
                    </div>
                  ) : (lastResult?.wrongGuessers?.length ? (
                    <div style={{opacity:.8, marginTop:6}}>
                      Yanlış: {lastResult.wrongGuessers.join(", ")}
                    </div>
                  ) : null)}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ===== Footer ===== */}
      <footer style={{ marginTop: 24, padding: "10px 0", textAlign:"center", opacity:.7, fontSize:14, borderTop:"1px solid #eee" }}>
        Tunix - TGame
      </footer>
    </div>
  );
}

/* === UI Bileşenleri === */
function ScoreBar({ scores, delta }:{ scores:{cacik:number;cucuk:number}, delta:{cacik:number;cucuk:number} }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
      <div style={{ padding:"10px 12px", border:"2px solid #2ecc71", borderRadius:10, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <b>🥒 Cacık</b>
        <div style={{ fontWeight:700, fontSize:18 }}>
          {scores.cacik ?? 0}{" "}
          {delta?.cacik ? <small style={{ color: delta.cacik>0?"#2ecc71":"#e74c3c" }}>({delta.cacik>0?"+":""}{delta.cacik})</small> : null}
        </div>
      </div>
      <div style={{ padding:"10px 12px", border:"2px solid #e67e22", borderRadius:10, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <b>🐣 Cücük</b>
        <div style={{ fontWeight:700, fontSize:18 }}>
          {scores.cucuk ?? 0}{" "}
          {delta?.cucuk ? <small style={{ color: delta.cucuk>0?"#2ecc71":"#e74c3c" }}>({delta.cucuk>0?"+":""}{delta.cucuk})</small> : null}
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ progress, label }:{ progress:number; label:string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4, fontSize:14, opacity:.8 }}>
        <span>İlerleme</span>
        <span>{label}</span>
      </div>
      <div style={{ height:10, background:"#eee", borderRadius:999 }}>
        <div style={{ height:"100%", width:`${Math.floor(progress*100)}%`, background:"#3498db", borderRadius:999 }} />
      </div>
    </div>
  );
}

function TeamCard({ title, players, onClick, color }:{
  title:string; players:Player[]; onClick:()=>void; color:string;
}) {
  return (
    <div style={{ border:`2px solid ${color}`, borderRadius:8, padding:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <h2 style={{ margin:0 }}>{title}</h2>
        <button onClick={onClick} style={{ ...BTN }}>Bu Takıma Geç</button>
      </div>
      <ul style={{ margin: "8px 0 0 18px" }}>
        {players.map(p=> <li key={p.id} style={{ marginBottom:4 }}>{p.name} {p.ready?"✅":""}</li>)}
      </ul>
    </div>
  );
}

/*** Çizim Tahtası — stroke geçmişi + undo destekli ***/
const CanvasBoard = forwardRef<CanvasBoardHandle, { enabled:boolean; socket:Socket|null }>(
  ({ enabled, socket }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

    const drawingRef = useRef(false);
    const brushRef = useRef<Brush>({ color: "#111", w: 4, tool: "pen" });
    const strokesRef = useRef<Stroke[]>([]);
    const currentStrokeRef = useRef<Stroke | null>(null);

    // 30Hz paketleme için buffer
    const outBufferRef = useRef<Pt[]>([]);
    const flushTimerRef = useRef<number | null>(null);

    useEffect(() => {
      const canvas = canvasRef.current!;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      const ctx = canvas.getContext("2d")!;
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctxRef.current = ctx;

      const onResize = () => {
        const rect2 = canvas.getBoundingClientRect();
        canvas.width = Math.floor(rect2.width * dpr);
        canvas.height = Math.floor(rect2.height * dpr);
        ctx.scale(dpr, dpr);
        redrawAll();
      };
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }, []);

    useEffect(() => {
      const flush = () => {
        if (!socket) return;
        if (outBufferRef.current.length === 0) return;
        socket.emit("stroke_point", { points: outBufferRef.current.splice(0) });
      };
      flushTimerRef.current = window.setInterval(flush, 33) as unknown as number;
      return () => { if (flushTimerRef.current) window.clearInterval(flushTimerRef.current); };
    }, [socket]);

    function redrawAll() {
      const ctx = ctxRef.current!;
      const c = canvasRef.current!;
      ctx.clearRect(0,0,c.width,c.height);
      for (const s of strokesRef.current) {
        if (!s.points.length) continue;
        ctx.beginPath();
        ctx.moveTo(s.points[0].x, s.points[0].y);
        ctx.strokeStyle = s.brush.tool === "eraser" ? "#fff" : s.brush.color;
        ctx.lineWidth = s.brush.w;
        for (let i = 1; i < s.points.length; i++) {
          const p = s.points[i];
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
      }
    }

    // === LOCAL DRAW ===
    function beginLocal(x:number, y:number) {
      const ctx = ctxRef.current!;
      ctx.beginPath();
      ctx.moveTo(x, y);
      drawingRef.current = true;

      const stroke: Stroke = { brush: { ...brushRef.current }, points: [{x,y,t:Date.now()}] };
      currentStrokeRef.current = stroke;
      strokesRef.current.push(stroke);

      socket?.emit("stroke_begin", { x, y, w: stroke.brush.w, tool: stroke.brush.tool, color: stroke.brush.color });
    }
    function moveLocal(x:number, y:number) {
      if (!drawingRef.current || !currentStrokeRef.current) return;
      const ctx = ctxRef.current!;
      const b = currentStrokeRef.current.brush;
      ctx.strokeStyle = b.tool === "eraser" ? "#fff" : b.color;
      ctx.lineWidth = b.w;
      ctx.lineTo(x, y);
      ctx.stroke();

      const pt = { x, y, t: Date.now() };
      currentStrokeRef.current.points.push(pt);
      outBufferRef.current.push(pt);
    }
    function endLocal() {
      drawingRef.current = false;
      currentStrokeRef.current = null;
      socket?.emit("stroke_end", {});
    }

    // Pointer handlers
    function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!enabled) return;
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
      beginLocal(e.clientX - rect.left, e.clientY - rect.top);
    }
    function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!enabled || !drawingRef.current) return;
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
      moveLocal(e.clientX - rect.left, e.clientY - rect.top);
    }
    function onPointerUp() { if (!enabled) return; endLocal(); }

    // === REMOTE SYNC ===
    function remoteStrokeBegin(p:any) {
      const ctx = ctxRef.current!;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);

      const brush: Brush = {
        color: p.color ?? brushRef.current.color,
        w: p.w ?? brushRef.current.w,
        tool: p.tool ?? brushRef.current.tool,
      };
      const stroke: Stroke = { brush, points: [{x:p.x,y:p.y,t:Date.now()}] };
      currentStrokeRef.current = stroke;
      strokesRef.current.push(stroke);
    }
    function remoteStrokePoint(p:any) {
      const ctx = ctxRef.current!;
      const s = currentStrokeRef.current;
      if (!s) return;
      ctx.strokeStyle = s.brush.tool === "eraser" ? "#fff" : s.brush.color;
      ctx.lineWidth = s.brush.w;
      for (const pt of p.points || []) {
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
        s.points.push(pt);
      }
    }
    function remoteStrokeEnd() {
      currentStrokeRef.current = null;
    }
    function remoteBrushChange(p:any) {
      if (p.color) brushRef.current.color = p.color;
      if (p.w != null) brushRef.current.w = p.w;
      if (p.tool) brushRef.current.tool = p.tool;
    }
    function remoteClear() {
      strokesRef.current.length = 0;
      const ctx = ctxRef.current!;
      const c = canvasRef.current!;
      ctx.clearRect(0,0,c.width,c.height);
    }
    function remoteUndo() {
      if (strokesRef.current.length === 0) return;
      strokesRef.current.pop();
      redrawAll();
    }

    // === LOCAL TOOLS ===
    function localBrushChange(p:{color?:string; w?:number; tool?:"pen"|"eraser"}) {
      if (p.color) brushRef.current.color = p.color;
      if (p.w != null) brushRef.current.w = p.w;
      if (p.tool) brushRef.current.tool = p.tool;
    }
    function localClear() {
      strokesRef.current.length = 0;
      const ctx = ctxRef.current!;
      const c = canvasRef.current!;
      ctx.clearRect(0,0,c.width,c.height);
    }
    function localUndo() {
      if (strokesRef.current.length === 0) return;
      strokesRef.current.pop();
      redrawAll();
    }

    useImperativeHandle(ref, () => ({
      localBrushChange,
      localClear,
      localUndo,
      remoteStrokeBegin,
      remoteStrokePoint,
      remoteStrokeEnd,
      remoteBrushChange,
      remoteClear,
      remoteUndo,
    }), []);

    return (
      <div style={{ border:"1px solid #ccc", borderRadius:8, overflow:"hidden", height: 360, marginTop: 8 }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", touchAction: "none", background:"#fff" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      </div>
    );
  }
);

/* ===== Toolbar (aktif highlight + animasyonlar) ===== */
function BrushToolbar({
  brush,
  onAction,
}: {
  brush: Brush;
  onAction:(action:"clear"|"undo"|"brush", payload?:any)=>void;
}) {
  const base: React.CSSProperties = {
    padding: "10px 12px",
    border: "1px solid #d0d0d0",
    borderRadius: 10,
    fontSize: 16,
    minHeight: 44,
    background: "#fafafa",
    cursor: "pointer",
    transition: "transform 60ms ease, box-shadow .2s ease, border-color .2s ease, background .2s ease",
  };
  const activeBump: React.CSSProperties = {
    transform: "translateY(-1px) scale(1.03)",
    boxShadow: "0 4px 12px rgba(0,0,0,.10)",
    borderColor: "#333",
    background: "#fff",
  };
  const chip: React.CSSProperties = {
    width: 34, height: 34, borderRadius: 8, border: "1px solid #ccc",
    transition: "transform 60ms ease, box-shadow .2s, border-color .2s",
    cursor: "pointer",
  };
  const groupTitle: React.CSSProperties = { fontSize: 14, opacity: .75, marginLeft: 4, marginRight: 4 };
  const colorList = ["#111", "#e74c3c", "#2ecc71", "#3498db", "#8e44ad", "#f1c40f"];

  return (
    <div style={{ display:"flex", gap:8, marginTop:10, alignItems:"center", flexWrap:"wrap" }}>
      <button
        onClick={()=>onAction("clear")}
        style={{ ...base }}
        onMouseDown={e => (e.currentTarget.style.transform = "scale(0.98)")}
        onMouseUp={e => (e.currentTarget.style.transform = "")}
        title="Tuvali temizle"
      >
        🧼 Temizle
      </button>

      <button
        onClick={()=>onAction("undo")}
        style={{ ...base }}
        onMouseDown={e => (e.currentTarget.style.transform = "scale(0.98)")}
        onMouseUp={e => (e.currentTarget.style.transform = "")}
        title="Geri al"
      >
        ↩️ Geri Al
      </button>

      <span style={groupTitle}>Renk:</span>
      {colorList.map(c => {
        const active = brush.color.toLowerCase() === c.toLowerCase() && brush.tool === "pen";
        return (
          <button
            key={c}
            onClick={()=>onAction("brush", { color:c, tool:"pen" })}
            aria-pressed={active}
            style={{
              ...chip,
              background: c,
              borderColor: active ? "#333" : "#ccc",
              boxShadow: active ? "0 0 0 2px #333 inset" : "none",
              transform: active ? "translateY(-1px) scale(1.05)" : undefined,
            }}
            title={`Renk: ${c}`}
          />
        );
      })}

      <span style={groupTitle}>Kalınlık:</span>
      {[3,6,10,16].map(w => {
        const active = brush.w === w;
        return (
          <button
            key={w}
            onClick={()=>onAction("brush", { w })}
            aria-pressed={active}
            style={{ ...base, padding:"6px 10px", ...(active ? activeBump : {}) }}
            title={`Kalınlık: ${w}`}
          >
            {w}px
          </button>
        );
      })}

      <button
        onClick={()=>onAction("brush", { tool:"pen" })}
        aria-pressed={brush.tool === "pen"}
        style={{ ...base, ...(brush.tool === "pen" ? activeBump : {}) }}
        title="Kalem"
      >
        ✏️ Kalem
      </button>

      <button
        onClick={()=>onAction("brush", { tool:"eraser" })}
        aria-pressed={brush.tool === "eraser"}
        style={{ ...base, ...(brush.tool === "eraser" ? activeBump : {}) }}
        title="Silgi"
      >
        🩹 Silgi
      </button>
    </div>
  );
}

function displayNameOf(id:string|null, players:Player[]) {
  if (!id) return "?";
  const p = players.find(x=>x.id===id);
  return p?.name || id.slice(0,6);
}
