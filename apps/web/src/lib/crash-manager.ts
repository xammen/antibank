// Crash Game State Manager - DB-backed for serverless
// Fully refactored for robust timing and state transitions

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
const MIN_PLAYERS_FOR_SKIP = 2;

class CrashGameManager {
  async getOrCreateCurrentGame() {
    // Chercher une partie running d'abord
    let game = await prisma.crashGame.findFirst({
      where: { status: "running" },
      include: {
        bets: {
          include: {
            user: { select: { id: true, discordUsername: true } }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    if (game) {
      return game;
    }

    // Chercher une partie waiting récente (créée il y a moins de countdown + 5s de grâce)
    const maxWaitingAge = COUNTDOWN_MS + 5000;
    const waitingGame = await prisma.crashGame.findFirst({
      where: { 
        status: "waiting",
        createdAt: { gte: new Date(Date.now() - maxWaitingAge) }
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

    if (waitingGame) {
      return waitingGame;
    }
    
    // Nettoyer les vieilles parties waiting (stale)
    await prisma.crashGame.updateMany({
      where: { 
        status: "waiting",
        createdAt: { lt: new Date(Date.now() - maxWaitingAge) }
      },
      data: { status: "crashed", crashedAt: new Date(), crashPoint: 1 }
    });

    // Pas de partie active, vérifier s'il y a une partie crashed récente
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

    // Créer une nouvelle partie (avec protection contre les race conditions)
    return this.createNewGame();
  }

  private async createNewGame() {
    // Vérifier une dernière fois qu'il n'y a pas de partie waiting/running
    // (protection contre race condition entre requêtes concurrentes)
    const existingGame = await prisma.crashGame.findFirst({
      where: { status: { in: ["waiting", "running"] } },
      include: {
        bets: {
          include: {
            user: { select: { id: true, discordUsername: true } }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    if (existingGame) {
      return existingGame;
    }

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
    const crashPoint = Number(game.crashPoint);
    
    if (game.status === "waiting") {
      // Calculer le countdown basé sur createdAt
      const elapsed = now - createdAt;
      const remainingMs = COUNTDOWN_MS - elapsed;
      countdown = Math.max(0, Math.ceil(remainingMs / 1000));
      
      // Si countdown terminé, démarrer le jeu (atomiquement)
      if (remainingMs <= 0) {
        const updated = await this.tryStartGame(game.id);
        if (updated) {
          state = "running";
          startTime = updated.startedAt?.getTime() || now;
          currentMultiplier = 1.00;
          countdown = 0;
        }
      }
    } else if (game.status === "running") {
      startTime = game.startedAt?.getTime() || (createdAt + COUNTDOWN_MS);
      const runningElapsed = Math.max(0, now - startTime);
      
      // Calculer le temps exact où ça doit crasher
      const crashTimeMs = timeToMultiplier(crashPoint);
      
      // Vérifier si on a crashé
      if (runningElapsed >= crashTimeMs) {
        const crashed = await this.tryCrash(game.id, crashPoint);
        if (crashed) {
          state = "crashed";
          currentMultiplier = crashPoint;
        } else {
          // Déjà crashé par une autre requête, récupérer l'état final
          currentMultiplier = crashPoint;
          state = "crashed";
        }
      } else {
        currentMultiplier = calculateMultiplier(runningElapsed);
      }
      
      countdown = 0;
    } else if (game.status === "crashed") {
      currentMultiplier = crashPoint;
      countdown = 0;
      // Note: la création de nouvelle partie est gérée par getOrCreateCurrentGame()
      // Ici on retourne juste l'état crashed, le prochain poll créera la nouvelle partie
    }

    const players: CrashPlayerPublic[] = game.bets.map(bet => ({
      odrzerId: bet.userId,
      odrzerame: bet.user.discordUsername,
      bet: Number(bet.amount),
      cashedOut: bet.cashOutAt !== null,
      cashOutMultiplier: bet.cashOutAt ? Number(bet.cashOutAt) : undefined,
      profit: bet.profit ? Number(bet.profit) : undefined,
    }));

    // Skip votes: récupérer depuis les bets (on utilise un champ existant ou on compte)
    // Pour simplifier, on va stocker ça en DB avec un nouveau champ sur crashBet
    // En attendant, pas de skip votes
    const skipVotes = 0;
    const skipVotesNeeded = Math.max(MIN_PLAYERS_FOR_SKIP, Math.ceil(players.length * 0.5));
    
    return {
      id: game.id,
      state,
      crashPoint: state === "crashed" ? crashPoint : undefined,
      currentMultiplier,
      countdown,
      startTime,
      players,
      skipVotes,
      skipVotesNeeded,
      history,
    };
  }

  /**
   * Démarre le jeu de manière atomique (évite les race conditions)
   */
  private async tryStartGame(gameId: string) {
    try {
      // updateMany avec condition atomique
      const result = await prisma.crashGame.updateMany({
        where: { 
          id: gameId,
          status: "waiting" // Only update if still waiting
        },
        data: {
          status: "running",
          startedAt: new Date(),
        }
      });

      if (result.count === 0) {
        // Already started by another request
        return null;
      }

      return prisma.crashGame.findUnique({
        where: { id: gameId }
      });
    } catch {
      return null;
    }
  }

  /**
   * Crash le jeu de manière atomique
   */
  private async tryCrash(gameId: string, crashPoint: number) {
    try {
      // Vérifier et update atomiquement
      const result = await prisma.crashGame.updateMany({
        where: { 
          id: gameId,
          status: "running" // Only crash if still running
        },
        data: {
          status: "crashed",
          crashedAt: new Date(),
        }
      });

      if (result.count === 0) {
        return false; // Already crashed
      }

      // Marquer les pertes pour les joueurs qui n'ont pas cashout
      await prisma.crashBet.updateMany({
        where: {
          crashGameId: gameId,
          cashOutAt: null,
        },
        data: {
          profit: new Prisma.Decimal(-1), // Will be replaced with actual loss
        }
      });

      // Mise à jour précise des pertes
      const losingBets = await prisma.crashBet.findMany({
        where: {
          crashGameId: gameId,
          cashOutAt: null,
        }
      });

      for (const bet of losingBets) {
        await prisma.crashBet.update({
          where: { id: bet.id },
          data: { profit: new Prisma.Decimal(-Number(bet.amount)) }
        });
      }

      return true;
    } catch {
      return false;
    }
  }

  async voteSkip(userId: string): Promise<{ success: boolean; skipped?: boolean }> {
    // Simplified: skip voting disabled for now to fix core issues first
    // TODO: Implement with DB-backed vote tracking
    return { success: false };
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

    try {
      await prisma.crashBet.create({
        data: {
          crashGameId: game.id,
          userId,
          amount: new Prisma.Decimal(amount),
        }
      });

      return { success: true };
    } catch {
      return { success: false, error: "erreur" };
    }
  }

  async cashOut(userId: string, clientMultiplier?: number): Promise<{ success: boolean; multiplier?: number; profit?: number; bet?: number }> {
    // Trouver le jeu en cours
    const game = await prisma.crashGame.findFirst({
      where: { status: "running" },
      orderBy: { createdAt: "desc" },
    });
    
    if (!game) {
      return { success: false };
    }

    // Chercher le bet
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

    const crashPoint = Number(game.crashPoint);

    // Utiliser le multiplicateur client s'il est fourni et valide
    // Sinon calculer depuis le serveur
    let multiplier: number;
    
    if (clientMultiplier && clientMultiplier >= 1.00 && clientMultiplier < crashPoint) {
      // Le client a envoyé un multiplicateur valide - l'utiliser
      multiplier = clientMultiplier;
    } else {
      // Calculer depuis le serveur (fallback)
      const startTime = game.startedAt?.getTime() || (game.createdAt.getTime() + COUNTDOWN_MS);
      const elapsed = Date.now() - startTime;
      multiplier = calculateMultiplier(elapsed);
      
      // Vérifier qu'on n'a pas déjà crashé
      const crashTimeMs = timeToMultiplier(crashPoint);
      if (elapsed >= crashTimeMs) {
        return { success: false };
      }
    }

    // S'assurer que le multiplier ne dépasse pas le crashPoint
    if (multiplier >= crashPoint) {
      return { success: false };
    }

    const betAmount = Number(bet.amount);
    const grossWin = betAmount * multiplier;
    const tax = (grossWin - betAmount) * 0.05;
    const profit = Math.floor((grossWin - betAmount - tax) * 100) / 100;

    // Mise à jour atomique
    try {
      const result = await prisma.crashBet.updateMany({
        where: { 
          id: bet.id,
          cashOutAt: null // Only if not already cashed out
        },
        data: {
          cashOutAt: new Prisma.Decimal(multiplier),
          profit: new Prisma.Decimal(profit),
        }
      });

      if (result.count === 0) {
        return { success: false };
      }

      return { success: true, multiplier, profit, bet: betAmount };
    } catch {
      return { success: false };
    }
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
