// Crash Game State Manager - DB-backed for serverless
// Refactored for proper timing, vote skip, and smooth gameplay

import { prisma, Prisma } from "@antibank/db";
import {
  generateCrashPoint,
  calculateMultiplier,
  timeToMultiplier,
  CRASH_CONFIG,
} from "./crash";

interface CrashPlayerPublic {
  odrzerId: string;
  odrzerame: string;
  bet: number;
  cashedOut: boolean;
  cashOutMultiplier?: number;
  profit?: number;
}

interface CrashHistoryEntry {
  id: string;
  crashPoint: number;
  createdAt: Date;
}

interface PublicState {
  id: string;
  state: "waiting" | "running" | "crashed";
  crashPoint?: number;
  currentMultiplier: number;
  countdown: number;
  startTime: number | null;
  players: CrashPlayerPublic[];
  skipVotes: number;
  skipVotesNeeded: number;
  history: CrashHistoryEntry[];
}

// Durées en ms
const COUNTDOWN_MS = CRASH_CONFIG.COUNTDOWN_SECONDS * 1000; // 15s de countdown
const POST_CRASH_DELAY_MS = 4000; // 4s après crash avant nouvelle partie
const MIN_PLAYERS_FOR_SKIP = 2; // Minimum de joueurs pour pouvoir voter skip

class CrashGameManager {
  private skipVoters: Set<string> = new Set();

  async getOrCreateCurrentGame() {
    // Chercher une partie en cours ou en attente
    let game = await prisma.crashGame.findFirst({
      where: {
        status: { in: ["waiting", "running"] }
      },
      include: {
        bets: {
          include: {
            user: { select: { id: true, discordUsername: true } }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    // Si pas de partie active, vérifier s'il y a une partie crashed récente
    if (!game) {
      const crashedGame = await prisma.crashGame.findFirst({
        where: { status: "crashed" },
        orderBy: { crashedAt: "desc" },
        include: {
          bets: {
            include: {
              user: { select: { id: true, discordUsername: true } }
            }
          }
        }
      });

      // Si la partie crashed est récente (< POST_CRASH_DELAY_MS), la retourner
      if (crashedGame?.crashedAt) {
        const timeSinceCrash = Date.now() - crashedGame.crashedAt.getTime();
        if (timeSinceCrash < POST_CRASH_DELAY_MS) {
          return crashedGame;
        }
      }

      // Sinon créer une nouvelle partie
      game = await this.createNewGame();
    }

    return game;
  }

  private async createNewGame() {
    // Reset skip voters
    this.skipVoters.clear();
    
    return prisma.crashGame.create({
      data: {
        crashPoint: new Prisma.Decimal(generateCrashPoint()),
        status: "waiting",
      },
      include: {
        bets: {
          include: {
            user: { select: { id: true, discordUsername: true } }
          }
        }
      }
    });
  }

  async getHistory(limit: number = 10): Promise<CrashHistoryEntry[]> {
    const games = await prisma.crashGame.findMany({
      where: { status: "crashed" },
      orderBy: { crashedAt: "desc" },
      take: limit,
      select: {
        id: true,
        crashPoint: true,
        createdAt: true,
      }
    });

    return games.map(g => ({
      id: g.id,
      crashPoint: Number(g.crashPoint),
      createdAt: g.createdAt,
    }));
  }

  async getPublicState(): Promise<PublicState> {
    const game = await this.getOrCreateCurrentGame();
    const history = await this.getHistory(10);
    
    const now = Date.now();
    const createdAt = game.createdAt.getTime();
    
    let state: "waiting" | "running" | "crashed" = game.status as "waiting" | "running" | "crashed";
    let countdown = CRASH_CONFIG.COUNTDOWN_SECONDS;
    let currentMultiplier = 1.00;
    let startTime: number | null = null;
    
    if (game.status === "waiting") {
      // Calculer le countdown basé sur createdAt
      const elapsed = now - createdAt;
      const remainingMs = COUNTDOWN_MS - elapsed;
      countdown = Math.max(0, Math.ceil(remainingMs / 1000));
      
      // Si countdown terminé, démarrer le jeu
      if (remainingMs <= 0) {
        await this.startGame(game.id);
        state = "running";
        startTime = now;
        currentMultiplier = 1.00;
        countdown = 0;
      }
    } else if (game.status === "running") {
      // Utiliser startedAt si disponible, sinon calculer depuis createdAt + countdown
      startTime = game.startedAt?.getTime() || (createdAt + COUNTDOWN_MS);
      const runningElapsed = Math.max(0, now - startTime);
      currentMultiplier = calculateMultiplier(runningElapsed);
      
      const crashPoint = Number(game.crashPoint);
      const crashTimeMs = timeToMultiplier(crashPoint);
      
      // Vérifier si on a crashé
      if (runningElapsed >= crashTimeMs) {
        await this.crash(game.id, crashPoint);
        state = "crashed";
        currentMultiplier = crashPoint;
      }
      
      countdown = 0;
    } else if (game.status === "crashed") {
      currentMultiplier = Number(game.crashPoint);
      countdown = 0;
      
      // Si crashed depuis assez longtemps, créer nouvelle partie
      if (game.crashedAt) {
        const timeSinceCrash = now - game.crashedAt.getTime();
        if (timeSinceCrash >= POST_CRASH_DELAY_MS) {
          // Créer nouvelle partie
          const newGame = await this.createNewGame();
          // Retourner directement l'état de la nouvelle partie
          return {
            id: newGame.id,
            state: "waiting",
            currentMultiplier: 1.00,
            countdown: CRASH_CONFIG.COUNTDOWN_SECONDS,
            startTime: null,
            players: [],
            skipVotes: 0,
            skipVotesNeeded: MIN_PLAYERS_FOR_SKIP,
            history,
          };
        }
      }
    }

    const players: CrashPlayerPublic[] = game.bets.map(bet => ({
      odrzerId: bet.userId,
      odrzerame: bet.user.discordUsername,
      bet: Number(bet.amount),
      cashedOut: bet.cashOutAt !== null,
      cashOutMultiplier: bet.cashOutAt ? Number(bet.cashOutAt) : undefined,
      profit: bet.profit ? Number(bet.profit) : undefined,
    }));

    // Calcul des votes skip
    const skipVotesNeeded = Math.max(MIN_PLAYERS_FOR_SKIP, Math.ceil(players.length * 0.5));
    
    return {
      id: game.id,
      state,
      crashPoint: state === "crashed" ? Number(game.crashPoint) : undefined,
      currentMultiplier,
      countdown,
      startTime,
      players,
      skipVotes: this.skipVoters.size,
      skipVotesNeeded,
      history,
    };
  }

  async voteSkip(userId: string): Promise<{ success: boolean; skipped?: boolean }> {
    const game = await this.getOrCreateCurrentGame();
    
    if (game.status !== "waiting") {
      return { success: false };
    }

    // Vérifier que le joueur a parié
    const hasBet = game.bets.some(b => b.userId === userId);
    if (!hasBet) {
      return { success: false };
    }

    // Ajouter le vote
    this.skipVoters.add(userId);

    // Vérifier si on a assez de votes
    const votesNeeded = Math.max(MIN_PLAYERS_FOR_SKIP, Math.ceil(game.bets.length * 0.5));
    
    if (this.skipVoters.size >= votesNeeded && game.bets.length >= MIN_PLAYERS_FOR_SKIP) {
      // Skip! Démarrer la partie immédiatement
      await this.startGame(game.id);
      this.skipVoters.clear();
      return { success: true, skipped: true };
    }

    return { success: true, skipped: false };
  }

  private async startGame(gameId: string) {
    await prisma.crashGame.update({
      where: { id: gameId },
      data: {
        status: "running",
        startedAt: new Date(),
      }
    });
    this.skipVoters.clear();
  }

  private async crash(gameId: string, crashPoint: number) {
    // Vérifier que la partie n'est pas déjà crashée
    const game = await prisma.crashGame.findUnique({
      where: { id: gameId },
      select: { status: true }
    });
    
    if (game?.status === "crashed") {
      return; // Déjà crashé
    }

    await prisma.$transaction(async (tx) => {
      // Update game status
      await tx.crashGame.update({
        where: { id: gameId },
        data: {
          status: "crashed",
          crashedAt: new Date(),
        }
      });

      // Récupérer les bets qui n'ont pas cashout
      const losingBets = await tx.crashBet.findMany({
        where: {
          crashGameId: gameId,
          cashOutAt: null,
        }
      });

      // Marquer les pertes
      for (const bet of losingBets) {
        await tx.crashBet.update({
          where: { id: bet.id },
          data: { profit: new Prisma.Decimal(-Number(bet.amount)) }
        });
      }
    });
  }

  async canBet(): Promise<boolean> {
    const game = await this.getOrCreateCurrentGame();
    return game.status === "waiting";
  }

  async hasPlayerBet(userId: string): Promise<boolean> {
    const game = await this.getOrCreateCurrentGame();
    return game.bets.some(b => b.userId === userId);
  }

  async placeBet(userId: string, username: string, amount: number): Promise<{ success: boolean; error?: string }> {
    const game = await this.getOrCreateCurrentGame();
    
    if (game.status !== "waiting") {
      return { success: false, error: "paris fermés" };
    }

    const existingBet = game.bets.find(b => b.userId === userId);
    if (existingBet) {
      return { success: false, error: "déjà parié" };
    }

    await prisma.crashBet.create({
      data: {
        crashGameId: game.id,
        userId,
        amount: new Prisma.Decimal(amount),
      }
    });

    return { success: true };
  }

  async cashOut(userId: string): Promise<{ success: boolean; multiplier?: number; profit?: number; bet?: number }> {
    // Trouver le jeu en cours
    const game = await prisma.crashGame.findFirst({
      where: { status: "running" },
      orderBy: { createdAt: "desc" },
    });
    
    if (!game) {
      return { success: false };
    }

    // Chercher le bet directement en DB (pas via le cache de game.bets)
    const bet = await prisma.crashBet.findFirst({
      where: {
        crashGameId: game.id,
        userId,
        cashOutAt: null,
      }
    });
    
    if (!bet) {
      return { success: false };
    }

    const startTime = game.startedAt?.getTime() || (game.createdAt.getTime() + COUNTDOWN_MS);
    const elapsed = Date.now() - startTime;
    const multiplier = calculateMultiplier(elapsed);
    const crashPoint = Number(game.crashPoint);

    // Vérifier qu'on n'a pas déjà crashé
    if (multiplier >= crashPoint) {
      return { success: false };
    }

    const betAmount = Number(bet.amount);
    const grossWin = betAmount * multiplier;
    const tax = (grossWin - betAmount) * 0.05;
    const profit = Math.floor((grossWin - betAmount - tax) * 100) / 100;

    await prisma.crashBet.update({
      where: { id: bet.id },
      data: {
        cashOutAt: new Prisma.Decimal(multiplier),
        profit: new Prisma.Decimal(profit),
      }
    });

    return { success: true, multiplier, profit, bet: betAmount };
  }

  async getUserBetHistory(userId: string, limit: number = 10): Promise<Array<{
    crashPoint: number;
    bet: number;
    cashOutAt: number | null;
    profit: number;
    createdAt: Date;
  }>> {
    const bets = await prisma.crashBet.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        crashGame: {
          select: { crashPoint: true, status: true }
        }
      }
    });

    return bets
      .filter(b => b.crashGame.status === "crashed")
      .map(b => ({
        crashPoint: Number(b.crashGame.crashPoint),
        bet: Number(b.amount),
        cashOutAt: b.cashOutAt ? Number(b.cashOutAt) : null,
        profit: Number(b.profit || 0),
        createdAt: b.createdAt,
      }));
  }
}

// Singleton (state is in DB, safe for serverless)
let crashManager: CrashGameManager | null = null;

export function getCrashManager(): CrashGameManager {
  if (!crashManager) {
    crashManager = new CrashGameManager();
  }
  return crashManager;
}
