"use server";

import { auth } from "@/lib/auth";
import { prisma, Prisma } from "@antibank/db";
import { determineWinner, calculateDiceWinnings, DICE_CONFIG } from "@/lib/dice";
import { addToAntibank } from "@/lib/antibank-corp";
import { trackHeistCasinoWin, trackHeistCasinoLoss } from "./heist";

export interface CreateChallengeResult {
  success: boolean;
  error?: string;
  gameId?: string;
  serverTime?: number;
}

export interface AcceptChallengeResult {
  success: boolean;
  error?: string;
  player1Roll?: number;
  player2Roll?: number;
  player1Dice?: [number, number];
  player2Dice?: [number, number];
  winnerId?: string | null;
  profit?: number;
  serverTime?: number;
}

export interface DiceGameState {
  success: boolean;
  error?: string;
  game?: {
    id: string;
    status: string;
    player1Roll?: number | null;
    player2Roll?: number | null;
    winnerId?: string | null;
    amount: number;
    player1Name: string;
    player2Name: string;
    completedAt?: Date | null;
  };
  serverTime: number;
}

/**
 * Crée un défi de dés
 */
export async function createDiceChallenge(
  targetUserId: string,
  amount: number
): Promise<CreateChallengeResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté" };
  }

  if (session.user.id === targetUserId) {
    return { success: false, error: "tu peux pas te défier toi-même" };
  }

  const [player1, player2] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id } }),
    prisma.user.findUnique({ where: { id: targetUserId } }),
  ]);

  if (!player1 || !player2) {
    return { success: false, error: "joueur introuvable" };
  }

  if (player1.isBanned || player2.isBanned) {
    return { success: false, error: "joueur banni" };
  }

  // Vérifier les soldes
  if (Number(player1.balance) < amount) {
    return { success: false, error: "solde insuffisant" };
  }
  if (Number(player2.balance) < amount) {
    return { success: false, error: "l'autre joueur n'a pas assez" };
  }

  // Vérifier mise min
  if (amount < DICE_CONFIG.MIN_BET) {
    return { success: false, error: `mise minimum: ${DICE_CONFIG.MIN_BET}€` };
  }

  try {
    // Créer le défi
    const game = await prisma.diceGame.create({
      data: {
        player1Id: session.user.id,
        player2Id: targetUserId,
        amount: new Prisma.Decimal(amount),
        status: "pending",
        expiresAt: new Date(Date.now() + DICE_CONFIG.CHALLENGE_EXPIRY_MS),
      },
    });

    return { success: true, gameId: game.id, serverTime: Date.now() };
  } catch (error) {
    console.error("Create dice challenge error:", error);
    return { success: false, error: "erreur serveur", serverTime: Date.now() };
  }
}

/**
 * Accepte un défi de dés - ATOMIC with updateMany to prevent race conditions
 */
export async function acceptDiceChallenge(
  gameId: string
): Promise<AcceptChallengeResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté", serverTime: Date.now() };
  }

  const game = await prisma.diceGame.findUnique({
    where: { id: gameId },
  });

  if (!game) {
    return { success: false, error: "défi introuvable", serverTime: Date.now() };
  }

  if (game.player2Id !== session.user.id) {
    return { success: false, error: "ce défi n'est pas pour toi", serverTime: Date.now() };
  }

  if (new Date() > game.expiresAt) {
    await prisma.diceGame.update({
      where: { id: gameId },
      data: { status: "expired" },
    });
    return { success: false, error: "défi expiré", serverTime: Date.now() };
  }

  // Lancer les dés avec valeurs individuelles
  const p1Die1 = Math.floor(Math.random() * 6) + 1;
  const p1Die2 = Math.floor(Math.random() * 6) + 1;
  const player1Roll = p1Die1 + p1Die2;
  const player1Dice: [number, number] = [p1Die1, p1Die2];

  const p2Die1 = Math.floor(Math.random() * 6) + 1;
  const p2Die2 = Math.floor(Math.random() * 6) + 1;
  const player2Roll = p2Die1 + p2Die2;
  const player2Dice: [number, number] = [p2Die1, p2Die2];

  const result = determineWinner(player1Roll, player2Roll);
  
  const amount = Number(game.amount);
  const winnerId = result === "tie" 
    ? null 
    : result === "player1" 
      ? game.player1Id 
      : game.player2Id;

  try {
    // ATOMIC: Use updateMany to prevent race conditions
    const updateResult = await prisma.diceGame.updateMany({
      where: { 
        id: gameId, 
        status: "pending" // Only update if still pending
      },
      data: { status: "playing" } // Temporary lock status
    });

    // If count === 0, another process already accepted
    if (updateResult.count === 0) {
      // Return current state with serverTime
      const currentGame = await prisma.diceGame.findUnique({
        where: { id: gameId },
      });
      if (currentGame?.status === "completed") {
        return { 
          success: false, 
          error: "défi déjà accepté",
          serverTime: Date.now()
        };
      }
      return { success: false, error: "défi déjà traité", serverTime: Date.now() };
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Déduire les mises
      await tx.user.update({
        where: { id: game.player1Id },
        data: { balance: { decrement: new Prisma.Decimal(amount) } },
      });
      await tx.user.update({
        where: { id: game.player2Id! },
        data: { balance: { decrement: new Prisma.Decimal(amount) } },
      });

      // Distribuer les gains
      const player1Winnings = calculateDiceWinnings(amount, result, true);
      const player2Winnings = calculateDiceWinnings(amount, result, false);

      if (player1Winnings > 0) {
        await tx.user.update({
          where: { id: game.player1Id },
          data: { balance: { increment: new Prisma.Decimal(player1Winnings) } },
        });
      }
      if (player2Winnings > 0) {
        await tx.user.update({
          where: { id: game.player2Id! },
          data: { balance: { increment: new Prisma.Decimal(player2Winnings) } },
        });
      }

      // Mettre à jour le jeu
      await tx.diceGame.update({
        where: { id: gameId },
        data: {
          status: "completed",
          player1Roll,
          player2Roll,
          winnerId,
          completedAt: new Date(),
        },
      });

      // Logger les transactions
      await tx.transaction.create({
        data: {
          userId: game.player1Id,
          type: "casino_dice",
          amount: new Prisma.Decimal(player1Winnings - amount),
          description: `Duel de dés: ${player1Roll} vs ${player2Roll}`,
        },
      });
      await tx.transaction.create({
        data: {
          userId: game.player2Id!,
          type: "casino_dice",
          amount: new Prisma.Decimal(player2Winnings - amount),
          description: `Duel de dés: ${player2Roll} vs ${player1Roll}`,
        },
      });
    });

    // Calculer le profit pour le joueur actuel (player2)
    const myProfit = calculateDiceWinnings(amount, result, false) - amount;

    return {
      success: true,
      player1Roll,
      player2Roll,
      player1Dice,
      player2Dice,
      winnerId,
      profit: myProfit,
      serverTime: Date.now(),
    };
  } catch (error) {
    console.error("Accept dice challenge error:", error);
    return { success: false, error: "erreur serveur", serverTime: Date.now() };
  }
}

/**
 * Annule un défi
 */
export async function cancelDiceChallenge(gameId: string): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté" };
  }

  const game = await prisma.diceGame.findUnique({
    where: { id: gameId },
  });

  if (!game) {
    return { success: false, error: "défi introuvable" };
  }

  if (game.player1Id !== session.user.id) {
    return { success: false, error: "tu ne peux annuler que tes propres défis" };
  }

  if (game.status !== "pending") {
    return { success: false, error: "défi déjà traité" };
  }

  await prisma.diceGame.update({
    where: { id: gameId },
    data: { status: "cancelled" },
  });

  return { success: true };
}

/**
 * Récupère les défis en attente pour un utilisateur
 */
export async function getPendingDiceChallenges() {
  const session = await auth();
  if (!session?.user?.id) {
    return { sent: [], received: [] };
  }

  const [sent, received] = await Promise.all([
    prisma.diceGame.findMany({
      where: {
        status: "pending",
        expiresAt: { gt: new Date() },
        player1Id: session.user.id,
      },
      include: {
        player2: { select: { id: true, discordUsername: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50, // Pagination: limite à 50 résultats
    }),
    prisma.diceGame.findMany({
      where: {
        status: "pending",
        expiresAt: { gt: new Date() },
        player2Id: session.user.id,
      },
      include: {
        player1: { select: { id: true, discordUsername: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return { sent, received };
}

/**
 * Récupère l'état d'une partie de dés (pour polling)
 */
export async function getDiceGameState(gameId: string): Promise<DiceGameState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté", serverTime: Date.now() };
  }

  const game = await prisma.diceGame.findUnique({
    where: { id: gameId },
    include: {
      player1: { select: { id: true, discordUsername: true } },
      player2: { select: { id: true, discordUsername: true } },
    },
  });

  if (!game) {
    return { success: false, error: "partie introuvable", serverTime: Date.now() };
  }

  // Vérifier que l'utilisateur est dans la partie
  if (game.player1Id !== session.user.id && game.player2Id !== session.user.id) {
    return { success: false, error: "pas dans cette partie", serverTime: Date.now() };
  }

  return {
    success: true,
    game: {
      id: game.id,
      status: game.status,
      player1Roll: game.player1Roll,
      player2Roll: game.player2Roll,
      winnerId: game.winnerId,
      amount: Number(game.amount),
      player1Name: game.player1?.discordUsername || "?",
      player2Name: game.player2?.discordUsername || "?",
      completedAt: game.completedAt,
    },
    serverTime: Date.now(),
  };
}

/**
 * Récupère les parties de dés récemment terminées (pour notification player1)
 * DEPRECATED: Use getDiceGameState instead for reliable polling
 */
export async function getRecentDiceResults() {
  const session = await auth();
  if (!session?.user?.id) {
    return [];
  }

  // Parties terminées dans les 30 dernières secondes
  const recentGames = await prisma.diceGame.findMany({
    where: {
      status: "completed",
      completedAt: { gte: new Date(Date.now() - 30000) },
      OR: [
        { player1Id: session.user.id },
        { player2Id: session.user.id },
      ],
    },
    include: {
      player1: { select: { id: true, discordUsername: true } },
      player2: { select: { id: true, discordUsername: true } },
    },
    orderBy: { completedAt: "desc" },
    take: 5,
  });

  return recentGames.map(game => {
    const isPlayer1 = game.player1Id === session.user.id;
    const myRoll = isPlayer1 ? game.player1Roll : game.player2Roll;
    const theirRoll = isPlayer1 ? game.player2Roll : game.player1Roll;
    const opponent = isPlayer1 ? game.player2 : game.player1;
    const amount = Number(game.amount);
    
    const won = game.winnerId === session.user.id;
    const tie = game.winnerId === null;
    const profit = won ? amount * 0.9 : tie ? -amount * 0.05 : -amount;

    // Recalculer les dés individuels à partir du total (approximation)
    const splitRoll = (roll: number | null): [number, number] => {
      if (!roll) return [1, 1];
      const d1 = Math.min(6, Math.max(1, Math.ceil(roll / 2)));
      const d2 = roll - d1;
      return [d1, Math.max(1, Math.min(6, d2))];
    };

    return {
      id: game.id,
      myRoll,
      theirRoll,
      myDice: splitRoll(myRoll),
      theirDice: splitRoll(theirRoll),
      opponentName: opponent?.discordUsername || "?",
      won,
      tie,
      profit,
      completedAt: game.completedAt,
    };
  });
}

/**
 * Récupère l'historique des parties de dés
 */
export async function getDiceHistory(limit = 20) {
  const session = await auth();
  if (!session?.user?.id) {
    return [];
  }

  const games = await prisma.diceGame.findMany({
    where: {
      status: "completed",
      OR: [
        { player1Id: session.user.id },
        { player2Id: session.user.id },
      ],
    },
    include: {
      player1: { select: { id: true, discordUsername: true } },
      player2: { select: { id: true, discordUsername: true } },
    },
    orderBy: { completedAt: "desc" },
    take: limit,
  });

  return games.map(game => {
    const isPlayer1 = game.player1Id === session.user.id;
    const myRoll = isPlayer1 ? game.player1Roll : game.player2Roll;
    const theirRoll = isPlayer1 ? game.player2Roll : game.player1Roll;
    const opponent = isPlayer1 ? game.player2 : game.player1;
    const amount = Number(game.amount);
    
    const won = game.winnerId === session.user.id;
    const tie = game.winnerId === null;
    const profit = won ? amount * 0.9 : tie ? -amount * 0.05 : -amount;

    return {
      id: game.id,
      myRoll,
      theirRoll,
      opponentName: opponent?.discordUsername || "bot",
      won,
      tie,
      profit,
      amount,
      completedAt: game.completedAt,
    };
  });
}

/**
 * Récupère la liste des joueurs disponibles pour un défi
 */
export async function getAvailablePlayers() {
  const session = await auth();
  if (!session?.user?.id) {
    return [];
  }

  const players = await prisma.user.findMany({
    where: {
      id: { not: session.user.id },
      isBanned: false,
    },
    select: {
      id: true,
      discordUsername: true,
      balance: true,
    },
    take: 100, // Limite à 100 joueurs actifs
    orderBy: { balance: "desc" }, // Joueurs les plus riches en premier
  });

  return players.map(p => ({
    id: p.id,
    name: p.discordUsername,
    balance: Number(p.balance),
  }));
}

export interface PlayVsBotResult {
  success: boolean;
  error?: string;
  playerRoll?: number;
  botRoll?: number;
  playerDice?: [number, number];
  botDice?: [number, number];
  won?: boolean;
  tie?: boolean;
  profit?: number;
}

/**
 * Joue un duel de dés contre le bot
 * Le bot lance des dés 100% aléatoires - aucun avantage
 */
/**
 * Demande un rematch après une partie terminée - DETERMINISTIC code system (no voting race conditions)
 * Uses code format: RD{last5chars} - same code for both players
 */
export async function requestDiceRematch(
  gameId: string
): Promise<{ success: boolean; error?: string; code?: string; newGameId?: string; serverTime?: number }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté", serverTime: Date.now() };
  }

  const game = await prisma.diceGame.findUnique({
    where: { id: gameId },
    include: {
      player1: { select: { id: true, balance: true, discordUsername: true } },
      player2: { select: { id: true, balance: true, discordUsername: true } },
    },
  });

  if (!game) {
    return { success: false, error: "partie introuvable", serverTime: Date.now() };
  }

  if (game.status !== "completed") {
    return { success: false, error: "partie non terminée", serverTime: Date.now() };
  }

  // Vérifier que l'utilisateur était dans la partie
  const isPlayer1 = game.player1Id === session.user.id;
  const isPlayer2 = game.player2Id === session.user.id;
  if (!isPlayer1 && !isPlayer2) {
    return { success: false, error: "tu n'étais pas dans cette partie", serverTime: Date.now() };
  }

  // Vérifier que la partie n'est pas trop vieille (max 5 min)
  if (game.completedAt && Date.now() - game.completedAt.getTime() > 5 * 60 * 1000) {
    return { success: false, error: "rematch expiré", serverTime: Date.now() };
  }

  const amount = Number(game.amount);

  // Vérifier le solde de l'utilisateur actuel
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { balance: true, discordUsername: true },
  });

  if (!user || Number(user.balance) < amount) {
    return { success: false, error: "solde insuffisant", serverTime: Date.now() };
  }

  // DETERMINISTIC REMATCH CODE - both players get the same code
  const rematchCode = `RD${gameId.slice(-5)}`;

  // Get opponent ID safely
  const opponentId = isPlayer1 ? game.player2Id : game.player1Id;
  
  if (!opponentId || !game.player2Id) {
    return { success: false, error: "partie 1v1 uniquement", serverTime: Date.now() };
  }

  // Check if rematch challenge already exists
  const existingRematch = await prisma.diceGame.findFirst({
    where: {
      OR: [
        { player1Id: game.player1Id, player2Id: game.player2Id },
        { player1Id: game.player2Id, player2Id: game.player1Id },
      ],
      status: "pending",
      createdAt: { gte: game.completedAt! }, // After the original game
    },
  });

  if (existingRematch) {
    // Check if it's ours
    if (existingRematch.player1Id === session.user.id || existingRematch.player2Id === session.user.id) {
      return { 
        success: true, 
        code: rematchCode, 
        newGameId: existingRematch.id,
        serverTime: Date.now()
      };
    }
  }

  // Create new rematch challenge with deterministic pattern
  // Player who clicks first becomes player1, other becomes player2
  const newGame = await prisma.diceGame.create({
    data: {
      player1Id: session.user.id,
      player2Id: opponentId,
      amount: game.amount,
      status: "pending",
      expiresAt: new Date(Date.now() + DICE_CONFIG.CHALLENGE_EXPIRY_MS),
    },
  });

  return { 
    success: true, 
    code: rematchCode, 
    newGameId: newGame.id,
    serverTime: Date.now()
  };
}

/**
 * Vérifie l'état du rematch pour une partie - DEPRECATED, use getDiceGameState or pending challenges instead
 */
export async function checkDiceRematchStatus(
  gameId: string
): Promise<{ 
  canRematch: boolean; 
  opponentId?: string;
  opponentName?: string;
  amount?: number;
  rematchGameId?: string;
  serverTime: number;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { canRematch: false, serverTime: Date.now() };
  }

  const game = await prisma.diceGame.findUnique({
    where: { id: gameId },
    include: {
      player1: { select: { id: true, discordUsername: true } },
      player2: { select: { id: true, discordUsername: true } },
    },
  });

  if (!game || game.status !== "completed") {
    return { canRematch: false, serverTime: Date.now() };
  }

  // Vérifier que la partie n'est pas trop vieille
  if (game.completedAt && Date.now() - game.completedAt.getTime() > 5 * 60 * 1000) {
    return { canRematch: false, serverTime: Date.now() };
  }

  const isPlayer1 = game.player1Id === session.user.id;
  const isPlayer2 = game.player2Id === session.user.id;

  if (!isPlayer1 && !isPlayer2) {
    return { canRematch: false, serverTime: Date.now() };
  }

  const opponent = isPlayer1 ? game.player2 : game.player1;

  // Check if a rematch challenge exists
  const opponentId = isPlayer1 ? game.player2Id : game.player1Id;
  if (!opponentId || !game.completedAt) {
    return { canRematch: false, serverTime: Date.now() };
  }

  const existingRematch = await prisma.diceGame.findFirst({
    where: {
      OR: [
        { player1Id: game.player1Id, player2Id: opponentId },
        { player1Id: opponentId, player2Id: game.player1Id },
      ],
      status: "pending",
      createdAt: { gte: game.completedAt },
    },
  });

  return { 
    canRematch: true,
    opponentId: opponent?.id,
    opponentName: opponent?.discordUsername,
    amount: Number(game.amount),
    rematchGameId: existingRematch?.id,
    serverTime: Date.now(),
  };
}

export async function playDiceVsBot(amount: number): Promise<PlayVsBotResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté" };
  }

  if (amount < DICE_CONFIG.MIN_BET) {
    return { success: false, error: `mise minimum: ${DICE_CONFIG.MIN_BET}€` };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (!user) {
    return { success: false, error: "utilisateur introuvable" };
  }

  if (Number(user.balance) < amount) {
    return { success: false, error: "solde insuffisant" };
  }

  // Lancer les dés - 100% équitable
  const playerDie1 = Math.floor(Math.random() * 6) + 1;
  const playerDie2 = Math.floor(Math.random() * 6) + 1;
  const playerRoll = playerDie1 + playerDie2;

  const botDie1 = Math.floor(Math.random() * 6) + 1;
  const botDie2 = Math.floor(Math.random() * 6) + 1;
  const botRoll = botDie1 + botDie2;

  const result = determineWinner(playerRoll, botRoll);
  const winnings = calculateDiceWinnings(amount, result, true);
  const profit = winnings - amount;

  // Calculer ce qui va à ANTIBANK (mise perdue ou frais d'égalité)
  let antibankGain = 0;
  if (result === "player2") {
    // Le joueur a perdu - toute la mise va à ANTIBANK
    antibankGain = amount;
  } else if (result === "tie") {
    // Égalité - les frais vont à ANTIBANK
    antibankGain = amount * 0.05;
  } else {
    // Le joueur a gagné - juste les frais (5% du profit)
    antibankGain = amount * 0.05;
  }

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Déduire la mise
      await tx.user.update({
        where: { id: session.user.id },
        data: { balance: { decrement: new Prisma.Decimal(amount) } },
      });

      // Ajouter les gains si applicable
      if (winnings > 0) {
        await tx.user.update({
          where: { id: session.user.id },
          data: { balance: { increment: new Prisma.Decimal(winnings) } },
        });
      }

      // Logger la transaction
      await tx.transaction.create({
        data: {
          userId: session.user.id,
          type: "casino_dice",
          amount: new Prisma.Decimal(profit),
          description: `Dés vs Bot: ${playerRoll} vs ${botRoll} - ${result === "player1" ? "Gagné" : result === "tie" ? "Égalité" : "Perdu"}`,
        },
      });
    });

    // Envoyer les gains à ANTIBANK
    if (antibankGain > 0) {
      addToAntibank(antibankGain, "dice vs bot").catch(() => {});
    }

    // Track pour la quête heist
    if (result === "player1") {
      trackHeistCasinoWin(session.user.id).catch(() => {});
    } else if (result === "player2") {
      trackHeistCasinoLoss(session.user.id).catch(() => {});
    }

    return {
      success: true,
      playerRoll,
      botRoll,
      playerDice: [playerDie1, playerDie2],
      botDice: [botDie1, botDie2],
      won: result === "player1",
      tie: result === "tie",
      profit,
    };
  } catch (error) {
    console.error("Play dice vs bot error:", error);
    return { success: false, error: "erreur serveur" };
  }
}
