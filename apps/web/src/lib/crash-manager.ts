// Crash Game State Manager - DB-backed for serverless
// Uses database to persist state between requests

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
  autoCashout?: number;
  profit?: number;
}

interface PublicState {
  id: string;
  state: "waiting" | "running" | "crashed";
  crashPoint?: number;
  currentMultiplier: number;
  countdown: number;
  startTime: number | null;
  players: CrashPlayerPublic[];
}

class CrashGameManager {
  
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

    // Si pas de partie active, en créer une nouvelle
    if (!game) {
      game = await prisma.crashGame.create({
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

    return game;
  }

  async getPublicState(): Promise<PublicState> {
    const game = await this.getOrCreateCurrentGame();
    
    const now = Date.now();
    const createdAt = game.createdAt.getTime();
    const elapsed = now - createdAt;
    
    let state: "waiting" | "running" | "crashed" = game.status as "waiting" | "running" | "crashed";
    let countdown = CRASH_CONFIG.COUNTDOWN_SECONDS;
    let currentMultiplier = 1.0;
    let startTime: number | null = null;
    
    if (game.status === "waiting") {
      // Countdown
      const elapsedSeconds = Math.floor(elapsed / 1000);
      countdown = Math.max(0, CRASH_CONFIG.COUNTDOWN_SECONDS - elapsedSeconds);
      
      // Si countdown terminé, passer en running
      if (countdown <= 0) {
        await this.startGame(game.id);
        state = "running";
        startTime = now;
      }
    } else if (game.status === "running") {
      startTime = game.startedAt?.getTime() || createdAt + CRASH_CONFIG.COUNTDOWN_SECONDS * 1000;
      const runningElapsed = now - startTime;
      currentMultiplier = calculateMultiplier(runningElapsed);
      
      const crashPoint = Number(game.crashPoint);
      const crashTimeMs = timeToMultiplier(crashPoint);
      
      // Check auto-cashouts
      await this.processAutoCashouts(game.id, currentMultiplier);
      
      // Si on a dépassé le crash point, crash
      if (runningElapsed >= crashTimeMs) {
        await this.crash(game.id, crashPoint);
        state = "crashed";
        currentMultiplier = crashPoint;
      }
    } else if (game.status === "crashed") {
      currentMultiplier = Number(game.crashPoint);
      
      // Si crashed depuis plus de 3 secondes, créer nouvelle partie
      if (game.crashedAt && now - game.crashedAt.getTime() > 3000) {
        // Créer nouvelle partie
        await prisma.crashGame.create({
          data: {
            crashPoint: new Prisma.Decimal(generateCrashPoint()),
            status: "waiting",
          }
        });
        // Re-fetch
        return this.getPublicState();
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

    return {
      id: game.id,
      state,
      crashPoint: state === "crashed" ? Number(game.crashPoint) : undefined,
      currentMultiplier,
      countdown,
      startTime,
      players,
    };
  }

  private async startGame(gameId: string) {
    await prisma.crashGame.update({
      where: { id: gameId },
      data: {
        status: "running",
        startedAt: new Date(),
      }
    });
  }

  private async crash(gameId: string, crashPoint: number) {
    await prisma.$transaction(async (tx) => {
      // Update game status
      await tx.crashGame.update({
        where: { id: gameId },
        data: {
          status: "crashed",
          crashedAt: new Date(),
        }
      });

      // Mark all non-cashed-out bets as lost
      await tx.crashBet.updateMany({
        where: {
          crashGameId: gameId,
          cashOutAt: null,
        },
        data: {
          profit: new Prisma.Decimal(0), // Will be recalculated as negative
        }
      });

      // Get all losing bets and set negative profit
      const losingBets = await tx.crashBet.findMany({
        where: {
          crashGameId: gameId,
          cashOutAt: null,
        }
      });

      for (const bet of losingBets) {
        await tx.crashBet.update({
          where: { id: bet.id },
          data: { profit: new Prisma.Decimal(-Number(bet.amount)) }
        });
      }
    });
  }

  private async processAutoCashouts(gameId: string, currentMultiplier: number) {
    // Pour l'instant, pas d'auto-cashout en DB
    // TODO: ajouter un champ autoCashoutAt dans CrashBet
  }

  canBet(gameStatus: string): boolean {
    return gameStatus === "waiting";
  }

  async hasPlayerBet(gameId: string, userId: string): Promise<boolean> {
    const bet = await prisma.crashBet.findFirst({
      where: {
        crashGameId: gameId,
        userId,
      }
    });
    return bet !== null;
  }

  async placeBet(userId: string, username: string, amount: number): Promise<{ success: boolean; error?: string }> {
    const game = await this.getOrCreateCurrentGame();
    
    if (game.status !== "waiting") {
      return { success: false, error: "paris fermés" };
    }

    const existingBet = await prisma.crashBet.findFirst({
      where: {
        crashGameId: game.id,
        userId,
      }
    });

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
    const game = await this.getOrCreateCurrentGame();
    
    if (game.status !== "running") {
      return { success: false };
    }

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

    const startTime = game.startedAt?.getTime() || game.createdAt.getTime() + CRASH_CONFIG.COUNTDOWN_SECONDS * 1000;
    const elapsed = Date.now() - startTime;
    const multiplier = calculateMultiplier(elapsed);
    const crashPoint = Number(game.crashPoint);

    // Check if already crashed
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
}

// Singleton (but state is in DB, so this is fine for serverless)
let crashManager: CrashGameManager | null = null;

export function getCrashManager(): CrashGameManager {
  if (!crashManager) {
    crashManager = new CrashGameManager();
  }
  return crashManager;
}
