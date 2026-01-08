// Crash Game State Manager - DB-backed for serverless
// Fully refactored for robust timing and state transitions

import { prisma, Prisma } from "@antibank/db";
import {
  generateCrashPoint,
  calculateMultiplier,
  timeToMultiplier,
  isBigMultiplierEvent,
  calculateCrashProfit,
  CRASH_CONFIG,
} from "./crash";
import { addToAntibank } from "./antibank-corp";
import { trackHeistCrashGame, trackHeistCasinoLoss } from "@/actions/heist";

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
  isBigMultiplier?: boolean;
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
  isBigMultiplierRound: boolean;
  nextBigMultiplierIn: number; // Nombre de parties avant le prochain check
}

// Durées en ms
const COUNTDOWN_MS = CRASH_CONFIG.COUNTDOWN_SECONDS * 1000; // 10s de countdown
const POST_CRASH_DELAY_MS = CRASH_CONFIG.POST_CRASH_DELAY_MS; // 3s après crash avant nouvelle partie
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

    // Compter les parties pour déterminer si c'est un Big Multiplier round
    const gameCount = await prisma.crashGame.count();
    const nextGameNumber = gameCount + 1;
    const isBigMultiplier = isBigMultiplierEvent(nextGameNumber);
    
    // Créer la nouvelle partie
    const newGame = await prisma.crashGame.create({
      data: {
        crashPoint: new Prisma.Decimal(generateCrashPoint(isBigMultiplier)),
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

    // Double-check: s'il y a plusieurs parties waiting, garder seulement la plus ancienne
    // et annuler les autres (protection race condition)
    const allWaiting = await prisma.crashGame.findMany({
      where: { status: "waiting" },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    });

    if (allWaiting.length > 1) {
      // Garder la première (plus ancienne), supprimer les autres
      const firstId = allWaiting[0].id;
      const toDelete = allWaiting.slice(1).map(g => g.id);
      
      await prisma.crashGame.deleteMany({
        where: { id: { in: toDelete } }
      });

      // Si notre partie a été supprimée, récupérer la bonne
      if (toDelete.includes(newGame.id)) {
        const correctGame = await prisma.crashGame.findUnique({
          where: { id: firstId },
          include: {
        bets: {
          include: {
            user: { select: { id: true, discordUsername: true } }
          }
        }
          }
        });
        if (correctGame) return correctGame;
      }
    }

    return newGame;
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

    // Skip votes: compte les joueurs qui ont voté pour skip
    let skipVotes = 0;
    if (state === "waiting" && players.length > 0) {
      try {
        const result = await prisma.$queryRaw<[{count: bigint}]>`
          SELECT COUNT(*) as count FROM "CrashBet" 
          WHERE "crashGameId" = ${game.id} AND "wantsSkip" = true
        `;
        skipVotes = Number(result[0]?.count || 0);
      } catch {
        skipVotes = 0;
      }
    }
    const skipVotesNeeded = Math.max(MIN_PLAYERS_FOR_SKIP, Math.ceil(players.length * 0.5));
    
    // Calculer le nombre de parties pour le Big Multiplier event
    // On compte le nombre total de parties crashed + la partie en cours
    const totalCrashedGames = await prisma.crashGame.count({
      where: { status: "crashed" }
    });
    const totalGames = totalCrashedGames + 1; // +1 pour la partie en cours
    const gamesSinceLastCheck = totalGames % 5;
    const nextBigMultiplierIn = gamesSinceLastCheck === 0 ? 0 : 5 - gamesSinceLastCheck;
    
    // Vérifier si c'est un round Big Multiplier (crash >= 5)
    const isBigMultiplierRound = crashPoint >= 5;
    
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
      isBigMultiplierRound,
      nextBigMultiplierIn,
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

      // Calculer le total des pertes pour ANTIBANK CORP
      let totalLosses = 0;
      
      for (const bet of losingBets) {
        const lossAmount = Number(bet.amount);
        totalLosses += lossAmount;
        await prisma.crashBet.update({
          where: { id: bet.id },
          data: { profit: new Prisma.Decimal(-lossAmount) }
        });
        
        // Track casino loss pour la quête heist (reset win streak)
        trackHeistCasinoLoss(bet.userId).catch(() => {});
      }

      // Envoyer les pertes à ANTIBANK CORP
      if (totalLosses > 0) {
        addToAntibank(totalLosses, `crash game - ${losingBets.length} joueur(s) n'ont pas cashout`)
          .then((newBalance) => console.log(`[ANTIBANK] +${totalLosses}€ crash losses, new balance: ${newBalance}€`))
          .catch((err) => console.error(`[ANTIBANK] Error adding crash losses:`, err));
      }

      return true;
    } catch {
      return false;
    }
  }

  async voteSkip(userId: string): Promise<{ success: boolean; skipped?: boolean }> {
    const game = await this.getOrCreateCurrentGame();
    
    // Can only vote skip during waiting phase
    if (game.status !== "waiting") {
      return { success: false };
    }

    // User must have placed a bet to vote
    const userBet = game.bets.find(b => b.userId === userId);
    if (!userBet) {
      return { success: false };
    }

    // Toggle skip vote using raw query (Prisma types not regenerated locally)
    try {
      await prisma.$executeRaw`UPDATE "CrashBet" SET "wantsSkip" = true WHERE id = ${userBet.id}`;

      // Check if enough votes to skip
      const skipVotesResult = await prisma.$queryRaw<[{count: bigint}]>`
        SELECT COUNT(*) as count FROM "CrashBet" 
        WHERE "crashGameId" = ${game.id} AND "wantsSkip" = true
      `;
      const skipVotes = Number(skipVotesResult[0]?.count || 0);
      const totalPlayers = game.bets.length;
      const skipVotesNeeded = Math.max(MIN_PLAYERS_FOR_SKIP, Math.ceil(totalPlayers * 0.5));

      // If enough votes, start the game immediately
      if (skipVotes >= skipVotesNeeded && totalPlayers >= MIN_PLAYERS_FOR_SKIP) {
        const started = await this.tryStartGame(game.id);
        return { success: true, skipped: !!started };
      }

      return { success: true, skipped: false };
    } catch {
      return { success: false };
    }
  }

  async canBet(): Promise<boolean> {
    const game = await this.getOrCreateCurrentGame();
    return game.status === "waiting";
  }

  async hasPlayerBet(userId: string): Promise<boolean> {
    const game = await this.getOrCreateCurrentGame();
    return game.bets.some(b => b.userId === userId);
  }

  /**
   * Méthode combinée pour éviter les appels multiples à getOrCreateCurrentGame
   */
  async canBetAndNotAlreadyBet(userId: string): Promise<{ canBet: boolean; alreadyBet: boolean; gameId?: string }> {
    const game = await this.getOrCreateCurrentGame();
    return {
      canBet: game.status === "waiting",
      alreadyBet: game.bets.some(b => b.userId === userId),
      gameId: game.id,
    };
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

      // Track pour la quête heist (si mise >= 1€)
      if (amount >= 1) {
        trackHeistCrashGame(userId).catch(() => {});
      }

      return { success: true };
    } catch {
      return { success: false, error: "erreur" };
    }
  }

  async cashOut(userId: string, clientMultiplier?: number): Promise<{ 
    success: boolean; 
    error?: string;
    multiplier?: number; 
    profit?: number; 
    bet?: number 
  }> {
    // Une seule query: trouver le bet avec son game
    const bet = await prisma.crashBet.findFirst({
      where: {
        userId,
        cashOutAt: null,
        crashGame: { status: "running" },
      },
      include: {
        crashGame: {
          select: { id: true, crashPoint: true, startedAt: true, createdAt: true }
        }
      }
    });
    
    if (!bet) {
      return { success: false, error: "pas de mise en cours" };
    }

    const game = bet.crashGame;
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
        return { success: false, error: "jeu terminé" };
      }
    }

    // S'assurer que le multiplier ne dépasse pas le crashPoint
    if (multiplier >= crashPoint) {
      return { success: false, error: "jeu terminé" };
    }

    const betAmount = Number(bet.amount);
    // Utiliser la formule centralisée pour garantir cohérence client/serveur
    const { tax, profit } = calculateCrashProfit(betAmount, multiplier);
    
    // Envoyer la taxe à ANTIBANK CORP
    if (tax > 0) {
      addToAntibank(tax, "taxe crash game")
        .then((newBalance) => console.log(`[ANTIBANK] +${tax}€ crash tax, new balance: ${newBalance}€`))
        .catch((err) => console.error(`[ANTIBANK] Error adding crash tax:`, err));
    }

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
        return { success: false, error: "déjà encaissé" };
      }

      return { success: true, multiplier, profit, bet: betAmount };
    } catch {
      return { success: false, error: "erreur serveur" };
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

/**
 * Transaction atomique: cashout + mise à jour balance + log transaction
 * Évite les race conditions entre cashout et balance update
 */
export async function cashOutWithBalance(
  userId: string, 
  clientMultiplier?: number
): Promise<{ 
  success: boolean; 
  error?: string;
  multiplier?: number; 
  profit?: number;
  newBalance?: number;
}> {
  const manager = getCrashManager();
  
  // 1. Effectuer le cashout (marque le bet comme encaissé)
  const cashoutResult = await manager.cashOut(userId, clientMultiplier);
  
  if (!cashoutResult.success) {
    return { success: false, error: cashoutResult.error };
  }
  
  const { multiplier, profit, bet } = cashoutResult;
  if (profit === undefined || bet === undefined || multiplier === undefined) {
    return { success: false, error: "erreur calcul" };
  }
  
  const winnings = bet + profit;
  
  // 2. Transaction atomique: update balance + log
  try {
    const updatedUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { balance: { increment: new Prisma.Decimal(winnings) } },
      });
      
      await tx.transaction.create({
        data: {
          userId: userId,
          type: "casino_crash",
          amount: new Prisma.Decimal(profit),
          description: `Crash x${multiplier.toFixed(2)}`,
        },
      });
      
      return user;
    });
    
    return { 
      success: true, 
      multiplier, 
      profit, 
      newBalance: Number(updatedUser.balance) 
    };
  } catch (err) {
    console.error("[CRASH] Balance update error:", err);
    // Le cashout a réussi mais le balance update a échoué
    // Cela ne devrait pas arriver, mais si c'est le cas, on doit le signaler
    return { success: false, error: "erreur mise à jour solde" };
  }
}
