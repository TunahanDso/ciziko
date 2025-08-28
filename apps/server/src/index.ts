import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

// 🔌 Ek modüller (9C)
import { installAfk } from "./afk";
import { pickOptions } from "./wordPicker";

const app = express();
app.use(cors());
app.get("/health", (_, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

/*** Tipler ***/
type Team = "cacik" | "cucuk";
interface Player {
  id: string;       // socket.id
  name: string;
  team: Team | null;
  ready: boolean;
}
interface TurnPlanItem {
  playerId: string;
  team: Team;
}
type Phase = "word_pick" | "drawing" | "guessing";

interface TurnState {
  phase: Phase;
  drawerId: string;
  team: Team;
  options: string[];           // 4 seçenek
  correctIndex: number;        // 0..3
  // oylar (rakip takım)
  votes: Map<string, number>;  // playerId -> optionIndex
  // tahminler (çizen takım)
  guesses: Map<string, number>;
  deadlines: {
    wordPickEndsAt?: number;
    drawingEndsAt?: number;
    guessingEndsAt?: number;
  };
  timers: {
    wordPick?: ReturnType<typeof setTimeout> | null;
    drawing?: ReturnType<typeof setTimeout> | null;
    guessing?: ReturnType<typeof setTimeout> | null;
  };
}

interface Room {
  code: string;
  players: Map<string, Player>; // key: socket.id
  status: "lobby" | "running" | "over";
  countdown?: ReturnType<typeof setInterval> | null;
  // Maç
  scores: { cacik: number; cucuk: number };
  usedWords: Set<string>;       // tekrarı engellemek için
  roundPlan: TurnPlanItem[];
  turnIndex: number;
  current?: TurnState | null;
}

const rooms = new Map<string, Room>();

// AFK modülü için socket.id -> roomCode eşlemesi
const socketRoom = new Map<string, string>();

/*** Oda yardımcıları ***/
function getOrCreateRoom(code: string): Room {
  let r = rooms.get(code);
  if (!r) {
    r = {
      code,
      players: new Map(),
      status: "lobby",
      countdown: null,
      scores: { cacik: 0, cucuk: 0 },
      usedWords: new Set(),
      roundPlan: [],
      turnIndex: 0,
      current: null,
    };
    rooms.set(code, r);
  }
  return r;
}

function snapshotRoom(r: Room) {
  const players = Array.from(r.players.values());
  const cacik = players.filter(p => p.team === "cacik");
  const cucuk = players.filter(p => p.team === "cucuk");
  const allReady = players.length > 0 && players.every(p => p.ready && p.team !== null);
  const teamsEqual = cacik.length === cucuk.length && cacik.length > 0;
  const canStart = r.status === "lobby" && allReady && teamsEqual;
  return {
    code: r.code,
    status: r.status,
    players,
    teams: { cacik, cucuk },
    canStart,
    reason: !teamsEqual ? "Takımlar eşit olmalı" : (!allReady ? "Herkes hazır olmalı" : undefined),
    scores: r.scores,
    turnIndex: r.turnIndex,
    totalTurns: r.roundPlan.length,
  };
}

function broadcastRoom(r: Room) {
  io.to(r.code).emit("room_snapshot", snapshotRoom(r));
}

function buildRoundPlan(r: Room) {
  const players = Array.from(r.players.values());
  const teamA = players.filter(p => p.team === "cacik");
  const teamB = players.filter(p => p.team === "cucuk");

  // Alternatif sıra: A0, B0, A1, B1, ... sonra herkes ikinci defa
  const seq: TurnPlanItem[] = [];
  const len = Math.min(teamA.length, teamB.length); // eşit olmalı zaten
  for (let i = 0; i < len; i++) {
    seq.push({ playerId: teamA[i].id, team: "cacik" });
    seq.push({ playerId: teamB[i].id, team: "cucuk" });
  }
  for (let i = 0; i < len; i++) {
    seq.push({ playerId: teamA[i].id, team: "cacik" });
    seq.push({ playerId: teamB[i].id, team: "cucuk" });
  }
  r.roundPlan = seq;
  r.turnIndex = 0;
}

function activePlayersByTeam(r: Room, team: Team): Player[] {
  return Array.from(r.players.values()).filter(p => p.team === team);
}
function otherTeam(team: Team): Team {
  return team === "cacik" ? "cucuk" : "cacik";
}

/*** Faz başlatıcılar ***/
function startNextTurn(r: Room) {
  r.current = null;

  // Oyun bitti mi?
  if (r.turnIndex >= r.roundPlan.length) {
    r.status = "over";
    broadcastRoom(r);
    io.to(r.code).emit("game_over", { scores: r.scores });
    return;
  }

  // Sıradaki çizer
  const plan = r.roundPlan[r.turnIndex];
  const drawer = r.players.get(plan.playerId);
  // Çizer ayrılmış olabilir → bu turu atla
  if (!drawer || drawer.team !== plan.team) {
    r.turnIndex += 1;
    return startNextTurn(r);
  }

  // 4 seçenek oluştur (rakip takım oy verecek) — tekrarsız
  const options = pickOptions(r.usedWords, 4);
  // Şimdilik correctIndex'i votes sonrası belirleyeceğiz (vote bitiminde)
  const state: TurnState = {
    phase: "word_pick",
    drawerId: drawer.id,
    team: plan.team,
    options,
    correctIndex: -1,
    votes: new Map(),
    guesses: new Map(),
    deadlines: {},
    timers: {},
  };
  r.current = state;

  // 10 sn word pick (yalnız rakip takıma gönder)
  const deadline = Date.now() + 10_000;
  state.deadlines.wordPickEndsAt = deadline;
  const opponent = otherTeam(plan.team);
  const oppPlayers = activePlayersByTeam(r, opponent);
  for (const p of oppPlayers) {
    io.to(p.id).emit("word_options", {
      options,
      deadline,
      turnIndex: r.turnIndex,
    });
  }

  // Çizere basit bilgilendirme (opsiyonel)
  io.to(plan.playerId).emit("turn_setup", {
    youAreDrawer: true,
    team: plan.team,
    turnIndex: r.turnIndex,
  });
  // Herkese çizer bilgisini yayınla
  io.to(r.code).emit("turn_setup_public", {
    drawerId: drawer.id,
    team: plan.team,
    turnIndex: r.turnIndex,
  });

  // 10 sn sonra oylama sonucu
  state.timers.wordPick = setTimeout(() => {
    finishWordPick(r);
  }, 10_000);
}

function finishWordPick(r: Room) {
  const st = r.current;
  if (!st || st.phase !== "word_pick") return;

  // Oylama sonucu: en çok oy alan; eşitlikte rastgele
  const tally = [0, 0, 0, 0];
  for (const [, idx] of st.votes) {
    if (idx >= 0 && idx < 4) tally[idx] += 1;
  }
  let max = -1;
  let candidates: number[] = [];
  for (let i = 0; i < 4; i++) {
    if (tally[i] > max) { max = tally[i]; candidates = [i]; }
    else if (tally[i] === max) candidates.push(i);
  }
  const chosenIndex = candidates.length > 0
    ? candidates[Math.floor(Math.random() * candidates.length)]
    : Math.floor(Math.random() * 4);
  st.correctIndex = chosenIndex;

  // Kelimeyi "kullanılmış" işaretle (pickOptions zaten eklemişti; burada tekrar etsek de sorun yok)
  const word = st.options[chosenIndex];
  r.usedWords.add(word);

  // Çizim fazına geç (45sn)
  st.phase = "drawing";
  const deadline = Date.now() + 45_000;
  st.deadlines.drawingEndsAt = deadline;

  // Çizere GİZLİ kelimeyi gönder
  io.to(st.drawerId).emit("secret_word", { word, deadline, options: st.options });

  // Herkese çizim başladı (kelime YOK)
  io.to(r.code).emit("draw_start", {
    drawerId: st.drawerId,
    team: st.team,
    options: st.options,
    deadline,
  });

  st.timers.wordPick && clearTimeout(st.timers.wordPick);
  st.timers.wordPick = null;
  st.timers.drawing = setTimeout(() => {
    startGuessing(r);
  }, 45_000);
}

function startGuessing(r: Room) {
  const st = r.current;
  if (!st || st.phase !== "drawing") return;

  st.phase = "guessing";
  const deadline = Date.now() + 15_000;
  st.deadlines.guessingEndsAt = deadline;

  // Çizen takım (drawer hariç) için tahmin fazı
  const teamPlayers = activePlayersByTeam(r, st.team).filter(p => p.id !== st.drawerId);
  for (const p of teamPlayers) {
    io.to(p.id).emit("guess_phase", {
      options: st.options,
      deadline,
    });
  }

  st.timers.drawing && clearTimeout(st.timers.drawing);
  st.timers.drawing = null;
  st.timers.guessing = setTimeout(() => {
    finishGuessing(r);
  }, 15_000);
}

function finishGuessing(r: Room) {
  const st = r.current;
  if (!st || st.phase !== "guessing") return;

  const teamPlayers = activePlayersByTeam(r, st.team).filter(p => p.id !== st.drawerId);

  let correct = 0, wrong = 0;
  const correctGuessers: string[] = [];
  const wrongGuessers: string[] = [];

  for (const p of teamPlayers) {
    const guess = st.guesses.get(p.id);
    if (guess === undefined) continue; // cevap vermeyenler nötr
    if (guess === st.correctIndex) {
      correct++;
      correctGuessers.push(p.name);
    } else {
      wrong++;
      wrongGuessers.push(p.name);
    }
  }

  // Skor: doğru başına +10, yanlış başına -5 (çizen takım)
  const deltaValue = correct * 10 - wrong * 5;
  if (st.team === "cacik") r.scores.cacik += deltaValue;
  else r.scores.cucuk += deltaValue;

  // İstemci için bu turun net değişimi
  const delta = st.team === "cacik"
    ? { cacik: deltaValue, cucuk: 0 }
    : { cacik: 0, cucuk: deltaValue };

  // Sonucu yayınla (zenginleştirilmiş payload)
  io.to(r.code).emit("turn_result", {
    correctIndex: st.correctIndex,
    teamScores: r.scores,
    delta,
    detail: { correct, wrong, team: st.team, drawerId: st.drawerId },
    correctGuessers,
    wrongGuessers,
  });

  // Temizlik ve sıradaki tura geçiş
  st.timers.guessing && clearTimeout(st.timers.guessing);
  st.timers.guessing = null;
  r.turnIndex += 1;
  setTimeout(() => startNextTurn(r), 1500);
}


/*** Lobi + Oyun Eventleri ***/
io.on("connection", (socket) => {
  let joinedRoom: string | null = null;

  socket.on("join_room", ({ roomCode, name }: { roomCode: string; name: string; }) => {
    const r = getOrCreateRoom(roomCode);
    joinedRoom = roomCode;
    socketRoom.set(socket.id, roomCode);

    socket.join(roomCode);
    r.players.set(socket.id, { id: socket.id, name, team: null, ready: false });
    broadcastRoom(r);
  });

  socket.on("switch_team", ({ team }: { team: Team }) => {
    if (!joinedRoom) return;
    const r = rooms.get(joinedRoom);
    if (!r) return;
    const p = r.players.get(socket.id);
    if (!p) return;
    p.team = team;
    p.ready = false; // takım değişince hazır düşsün
    broadcastRoom(r);
  });

  socket.on("toggle_ready", () => {
    if (!joinedRoom) return;
    const r = rooms.get(joinedRoom);
    if (!r) return;
    const p = r.players.get(socket.id);
    if (!p || p.team === null) return;
    p.ready = !p.ready;
    broadcastRoom(r);

    const snap = snapshotRoom(r);
    if (snap.canStart && !r.countdown) {
      r.countdown = setCountdown(r);
    }
  });

  // RAKİP takım oyları (kelime seçimi)
  socket.on("word_vote", ({ optionIndex }: { optionIndex: number }) => {
    if (!joinedRoom) return;
    const r = rooms.get(joinedRoom);
    if (!r || !r.current || r.current.phase !== "word_pick") return;
    const st = r.current;

    const voter = r.players.get(socket.id);
    if (!voter || voter.team === null) return;
    // Sadece rakip takım oy kullanabilir
    if (voter.team === st.team) return;
    if (optionIndex < 0 || optionIndex > 3) return;

    st.votes.set(voter.id, optionIndex);
  });

  // ÇİZEN takım tahminleri (drawer hariç)
  socket.on("guess_submit", ({ optionIndex }: { optionIndex: number }) => {
    if (!joinedRoom) return;
    const r = rooms.get(joinedRoom);
    if (!r || !r.current || r.current.phase !== "guessing") return;
    const st = r.current;

    const pl = r.players.get(socket.id);
    if (!pl || pl.team !== st.team) return;
    if (pl.id === st.drawerId) return;
    if (optionIndex < 0 || optionIndex > 3) return;

    st.guesses.set(pl.id, optionIndex);

    // Tüm takım cevapladıysa erken bitir
    const teamPlayers = activePlayersByTeam(r, st.team).filter(p => p.id !== st.drawerId);
    if (teamPlayers.length > 0 && st.guesses.size >= teamPlayers.length) {
      finishGuessing(r);
    }
  });

  // CANVAS — çizim olaylarını oda geneline relay et
  socket.on("stroke_begin", (payload) => {
    if (!joinedRoom) return;
    const r = rooms.get(joinedRoom);
    if (!r || !r.current || r.current.phase !== "drawing") return;
    if (socket.id !== r.current.drawerId) return;   // yalnız çizer
    socket.to(joinedRoom).emit("stroke_begin", payload);
  });
  socket.on("stroke_point", (payload) => {
    if (!joinedRoom) return;
    const r = rooms.get(joinedRoom);
    if (!r || !r.current || r.current.phase !== "drawing") return;
    if (socket.id !== r.current.drawerId) return;
    socket.to(joinedRoom).emit("stroke_point", payload);
  });
  socket.on("stroke_end", (payload) => {
    if (!joinedRoom) return;
    const r = rooms.get(joinedRoom);
    if (!r || !r.current || r.current.phase !== "drawing") return;
    if (socket.id !== r.current.drawerId) return;
    socket.to(joinedRoom).emit("stroke_end", payload);
  });
  socket.on("brush_change", (payload) => {
    if (!joinedRoom) return;
    const r = rooms.get(joinedRoom);
    if (!r || !r.current || r.current.phase !== "drawing") return;
    if (socket.id !== r.current.drawerId) return;
    socket.to(joinedRoom).emit("brush_change", payload);
  });
  socket.on("canvas_clear", () => {
    if (!joinedRoom) return;
    const r = rooms.get(joinedRoom);
    if (!r || !r.current || r.current.phase !== "drawing") return;
    if (socket.id !== r.current.drawerId) return;
    socket.to(joinedRoom).emit("canvas_clear");
  });
  socket.on("undo", () => {
    if (!joinedRoom) return;
    const r = rooms.get(joinedRoom);
    if (!r || !r.current || r.current.phase !== "drawing") return;
    if (socket.id !== r.current.drawerId) return;
    socket.to(joinedRoom).emit("undo");
  });

  socket.on("disconnect", () => {
    const roomCode = joinedRoom;
    socketRoom.delete(socket.id);
    if (!roomCode) return;

    const r = rooms.get(roomCode);
    if (!r) return;

    r.players.delete(socket.id);

    // Oda boşsa temizle
    if (r.players.size === 0) {
      // temizlik: aktif timer’ları temizle
      if (r.current?.timers.wordPick) clearTimeout(r.current.timers.wordPick);
      if (r.current?.timers.drawing) clearTimeout(r.current.timers.drawing);
      if (r.current?.timers.guessing) clearTimeout(r.current.timers.guessing);
      if (r.countdown) clearInterval(r.countdown);
      rooms.delete(roomCode);
    } else {
      broadcastRoom(r);
    }
  });
});

/*** Geri sayım (3-2-1) ve maç başlangıcı ***/
function setCountdown(r: Room) {
  let t = 3;
  io.to(r.code).emit("start_countdown", { t });
  const timer = setInterval(() => {
    t -= 1;
    if (t > 0) io.to(r.code).emit("start_countdown", { t });
    else {
      clearInterval(timer);
      r.countdown = null;
      r.status = "running";
      r.scores = { cacik: 0, cucuk: 0 };
      r.usedWords.clear();
      buildRoundPlan(r);
      io.to(r.code).emit("match_started", { startedAt: Date.now(), totalTurns: r.roundPlan.length });
      startNextTurn(r);
    }
  }, 1000);
  return timer;
}

/*** AFK modülünü ayağa kaldır ***/
installAfk(
  io,
  // getCtx
  (socket) => {
    const roomCode = socketRoom.get(socket.id) || null;
    const playerId = socket.id || null;
    return { roomCode, playerId };
  },
  // setReady
  (roomCode, playerId, ready) => {
    const r = rooms.get(roomCode);
    if (!r) return;
    const p = r.players.get(playerId);
    if (!p) return;
    p.ready = !!ready;
    broadcastRoom(r);
  },
  45_000, // idleMs: 45s hareketsiz kalan hazırdan düşer
  10_000  // tickMs: 10s’de bir kontrol
);

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`Ciziko server on http://localhost:${PORT}`);
});
