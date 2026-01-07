// Crash Game State Manager (Singleton côté serveur)
// Utilise globalThis pour persister entre les hot reloads

import {
  generateCrashPoint,
  calculateMultiplier,
  timeToMultiplier,
  CRASH_CONFIG,
  type CrashGameState,
  type CrashPlayer,
} from "./crash";

interface GameState {
  id: string;
  state: CrashGameState;
  crashPoint: number;
  currentMultiplier: number;
  startTime: number | null;
  players: Map<string, CrashPlayer>;
  countdown: number;
}

class CrashGameManager {
  private currentGame: GameState;
  private gameInterval: ReturnType<typeof setInterval> | null = null;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.currentGame = this.createNewGame();
    this.startCountdown();
    console.log("[CrashManager] Initialized, crashPoint:", this.currentGame.crashPoint);
  }

  private createNewGame(): GameState {
    return {
      id: crypto.randomUUID(),
      state: "waiting",
      crashPoint: generateCrashPoint(),
      currentMultiplier: 1.0,
      startTime: null,
      players: new Map(),
      countdown: CRASH_CONFIG.COUNTDOWN_SECONDS,
    };
  }

  private startCountdown() {
    this.currentGame.state = "waiting";
    this.currentGame.countdown = CRASH_CONFIG.COUNTDOWN_SECONDS;
    console.log("[CrashManager] Countdown started:", this.currentGame.countdown);

    this.countdownInterval = setInterval(() => {
      this.currentGame.countdown--;

      if (this.currentGame.countdown <= 0) {
        if (this.countdownInterval) {
          clearInterval(this.countdownInterval);
          this.countdownInterval = null;
        }
        this.startGame();
      }
    }, 1000);
  }

  private startGame() {
    this.currentGame.state = "running";
    this.currentGame.startTime = Date.now();
    this.currentGame.currentMultiplier = 1.0;
    
    const crashTimeMs = timeToMultiplier(this.currentGame.crashPoint);
    console.log("[CrashManager] Game started, crashPoint:", this.currentGame.crashPoint, "crashTime:", crashTimeMs, "ms");

    this.gameInterval = setInterval(() => {
      const elapsed = Date.now() - this.currentGame.startTime!;
      this.currentGame.currentMultiplier = calculateMultiplier(elapsed);

      // Check si on a dépassé le temps de crash
      if (elapsed >= crashTimeMs) {
        this.crash();
      }
    }, CRASH_CONFIG.TICK_RATE_MS);
  }

  private crash() {
    if (this.gameInterval) {
      clearInterval(this.gameInterval);
      this.gameInterval = null;
    }

    this.currentGame.state = "crashed";
    this.currentGame.currentMultiplier = this.currentGame.crashPoint;
    console.log("[CrashManager] CRASHED at", this.currentGame.crashPoint);

    // Marquer tous les joueurs non-cashout comme perdants
    this.currentGame.players.forEach((player) => {
      if (!player.cashedOut) {
        player.profit = -player.bet;
      }
    });

    // Nouvelle partie après 3 secondes
    setTimeout(() => {
      this.currentGame = this.createNewGame();
      this.startCountdown();
    }, 3000);
  }

  getPublicState() {
    return {
      id: this.currentGame.id,
      state: this.currentGame.state,
      crashPoint: this.currentGame.state === "crashed" ? this.currentGame.crashPoint : undefined,
      currentMultiplier: this.currentGame.currentMultiplier,
      countdown: this.currentGame.countdown,
      startTime: this.currentGame.startTime,
      players: Array.from(this.currentGame.players.values()).map((p) => ({
        odrzerId: p.odrzerId,
        odrzerame: p.odrzerame,
        bet: p.bet,
        cashedOut: p.cashedOut,
        cashOutMultiplier: p.cashOutMultiplier,
        profit: p.profit,
      })),
    };
  }

  canBet(): boolean {
    return this.currentGame.state === "waiting";
  }

  hasPlayerBet(odrzerId: string): boolean {
    return this.currentGame.players.has(odrzerId);
  }

  placeBet(odrzerId: string, odrzerame: string, amount: number): boolean {
    if (!this.canBet()) {
      console.log("[CrashManager] Cannot bet, state:", this.currentGame.state);
      return false;
    }
    if (this.currentGame.players.has(odrzerId)) {
      console.log("[CrashManager] Player already has bet");
      return false;
    }

    this.currentGame.players.set(odrzerId, {
      odrzerId,
      odrzerame,
      bet: amount,
      cashedOut: false,
    });
    
    console.log("[CrashManager] Bet placed:", odrzerame, amount);
    return true;
  }

  cashOut(odrzerId: string): { success: boolean; multiplier?: number; profit?: number; bet?: number } {
    if (this.currentGame.state !== "running") {
      return { success: false };
    }

    const player = this.currentGame.players.get(odrzerId);
    if (!player || player.cashedOut) {
      return { success: false };
    }

    const multiplier = this.currentGame.currentMultiplier;
    const grossWin = player.bet * multiplier;
    const tax = (grossWin - player.bet) * 0.05;
    const profit = Math.floor((grossWin - player.bet - tax) * 100) / 100;

    player.cashedOut = true;
    player.cashOutMultiplier = multiplier;
    player.profit = profit;

    console.log("[CrashManager] Cashout:", odrzerId, "at", multiplier, "profit:", profit);
    return { success: true, multiplier, profit, bet: player.bet };
  }
}

// Singleton global qui persiste entre les hot reloads
const globalForCrash = globalThis as unknown as {
  crashManager: CrashGameManager | undefined;
};

export function getCrashManager(): CrashGameManager {
  if (!globalForCrash.crashManager) {
    globalForCrash.crashManager = new CrashGameManager();
  }
  return globalForCrash.crashManager;
}

export type { GameState };
