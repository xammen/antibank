import type * as Party from "partykit/server";

// Types
interface CrashPlayer {
  userId: string;
  username: string;
  bet: number;
  cashedOut: boolean;
  cashOutMultiplier?: number;
  profit?: number;
}

interface GameState {
  id: string;
  state: "waiting" | "running" | "crashed";
  crashPoint: number;
  currentMultiplier: number;
  countdown: number;
  startTime: number | null;
  players: CrashPlayer[];
}

type ClientMessage =
  | { type: "BET"; userId: string; username: string; amount: number }
  | { type: "CASHOUT"; userId: string };

// Game constants
const COUNTDOWN_SECONDS = 5;
const TICK_RATE_MS = 100;
const MULTIPLIER_SPEED = 0.0001;
const MIN_BET = 10;

// Crash point generation (house edge ~5%)
function generateCrashPoint(): number {
  const e = -100 / 5; // house edge 5%
  const h = Math.random();
  return Math.max(1, Math.floor((100 * Math.E ** (e * h)) / 100));
}

function calculateMultiplier(elapsedMs: number): number {
  return Math.max(1, 1 + elapsedMs * MULTIPLIER_SPEED);
}

function timeToMultiplier(multiplier: number): number {
  return Math.max(0, (multiplier - 1) / MULTIPLIER_SPEED);
}

export default class CrashGameServer implements Party.Server {
  gameState: GameState;
  gameInterval: ReturnType<typeof setInterval> | null = null;
  countdownInterval: ReturnType<typeof setInterval> | null = null;
  players: Map<string, CrashPlayer> = new Map();

  constructor(readonly room: Party.Room) {
    this.gameState = this.createNewGame();
    console.log("[CrashGame] Server started, room:", room.id);
    this.startCountdown();
  }

  private createNewGame(): GameState {
    this.players.clear();
    return {
      id: crypto.randomUUID(),
      state: "waiting",
      crashPoint: generateCrashPoint(),
      currentMultiplier: 1.0,
      startTime: null,
      countdown: COUNTDOWN_SECONDS,
      players: [],
    };
  }

  private startCountdown() {
    this.gameState.state = "waiting";
    this.gameState.countdown = COUNTDOWN_SECONDS;
    console.log("[CrashGame] Countdown started:", this.gameState.countdown);

    this.broadcast();

    this.countdownInterval = setInterval(() => {
      this.gameState.countdown--;
      this.broadcast();

      if (this.gameState.countdown <= 0) {
        if (this.countdownInterval) {
          clearInterval(this.countdownInterval);
          this.countdownInterval = null;
        }
        this.startGame();
      }
    }, 1000);
  }

  private startGame() {
    this.gameState.state = "running";
    this.gameState.startTime = Date.now();
    this.gameState.currentMultiplier = 1.0;
    
    const crashTimeMs = timeToMultiplier(this.gameState.crashPoint);
    console.log("[CrashGame] Game started, crashPoint:", this.gameState.crashPoint, "crashTime:", crashTimeMs, "ms");

    this.broadcast();

    this.gameInterval = setInterval(() => {
      const elapsed = Date.now() - this.gameState.startTime!;
      this.gameState.currentMultiplier = calculateMultiplier(elapsed);

      this.broadcast();

      if (elapsed >= crashTimeMs) {
        this.crash();
      }
    }, TICK_RATE_MS);
  }

  private crash() {
    if (this.gameInterval) {
      clearInterval(this.gameInterval);
      this.gameInterval = null;
    }

    this.gameState.state = "crashed";
    this.gameState.currentMultiplier = this.gameState.crashPoint;
    console.log("[CrashGame] CRASHED at", this.gameState.crashPoint);

    // Mark all non-cashed-out players as losers
    this.players.forEach((player) => {
      if (!player.cashedOut) {
        player.profit = -player.bet;
      }
    });

    this.gameState.players = Array.from(this.players.values());
    this.broadcast();

    // New game after 3 seconds
    setTimeout(() => {
      this.gameState = this.createNewGame();
      this.startCountdown();
    }, 3000);
  }

  private broadcast() {
    this.gameState.players = Array.from(this.players.values());
    this.room.broadcast(JSON.stringify(this.gameState));
  }

  onConnect(conn: Party.Connection) {
    console.log("[CrashGame] Client connected:", conn.id);
    // Send current state to new connection
    conn.send(JSON.stringify(this.gameState));
  }

  onMessage(message: string, sender: Party.Connection) {
    try {
      const msg: ClientMessage = JSON.parse(message);

      if (msg.type === "BET") {
        if (this.gameState.state !== "waiting") {
          sender.send(JSON.stringify({ error: "paris fermés" }));
          return;
        }

        if (this.players.has(msg.userId)) {
          sender.send(JSON.stringify({ error: "pari déjà placé" }));
          return;
        }

        if (msg.amount < MIN_BET) {
          sender.send(JSON.stringify({ error: `mise minimum: ${MIN_BET}€` }));
          return;
        }

        this.players.set(msg.userId, {
          userId: msg.userId,
          username: msg.username,
          bet: msg.amount,
          cashedOut: false,
        });

        console.log("[CrashGame] Bet placed:", msg.username, msg.amount);
        this.broadcast();
      }

      if (msg.type === "CASHOUT") {
        if (this.gameState.state !== "running") {
          sender.send(JSON.stringify({ error: "pas de jeu en cours" }));
          return;
        }

        const player = this.players.get(msg.userId);
        if (!player || player.cashedOut) {
          sender.send(JSON.stringify({ error: "impossible de cash out" }));
          return;
        }

        const multiplier = this.gameState.currentMultiplier;
        const grossWin = player.bet * multiplier;
        const tax = (grossWin - player.bet) * 0.05;
        const profit = Math.floor((grossWin - player.bet - tax) * 100) / 100;

        player.cashedOut = true;
        player.cashOutMultiplier = multiplier;
        player.profit = profit;

        console.log("[CrashGame] Cashout:", msg.userId, "at", multiplier, "profit:", profit);
        
        sender.send(JSON.stringify({ 
          success: true, 
          multiplier, 
          profit,
        }));
        
        this.broadcast();
      }
    } catch (error) {
      console.error("[CrashGame] Message error:", error);
      sender.send(JSON.stringify({ error: "message invalide" }));
    }
  }

  onClose(conn: Party.Connection) {
    console.log("[CrashGame] Client disconnected:", conn.id);
  }
}

CrashGameServer satisfies Party.Worker;
