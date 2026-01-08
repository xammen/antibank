"use server";

import { auth } from "@/lib/auth";
import { prisma, Prisma } from "@antibank/db";
import { 
  determinePFCWinner, 
  calculatePFCWinnings, 
  calculatePenalty,
  PFC_CONFIG,
  type PFCChoice 
} from "@/lib/pfc";

import { addToAntibank } from "@/lib/antibank-corp";
import { trackHeistCasinoWin, trackHeistCasinoLoss } from "./heist";

export interface CreatePFCResult {
  success: boolean;
  error?: string;
  gameId?: string;
  serverTime?: number;
}

export interface MakeChoiceResult {
  success: boolean;
  error?: string;
  player1Choice?: PFCChoice;
  player2Choice?: PFCChoice;
  winnerId?: string | null;
  profit?: number;
  waiting?: boolean;
  serverTime?: number;
}

export interface PFCGameState {
  success: boolean;
  error?: string;
  game?: {
    id: string;
    status: string;
    player1Choice?: string | null;
    player2Choice?: string | null;
    winnerId?: string | null;
    amount: number;
    player1Name: string;
    player2Name: string;
    completedAt?: Date | null;
  };
  serverTime: number;
}

/**
 * Crée un défi PFC
 */
export async function createPFCChallenge(
  targetUserId: string,
  amount: number
): Promise<CreatePFCResult> {
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

  if (Number(player1.balance) < amount || Number(player2.balance) < amount) {
    return { success: false, error: "solde insuffisant" };
  }

  if (amount < PFC_CONFIG.MIN_BET) {
    return { success: false, error: `mise minimum: ${PFC_CONFIG.MIN_BET}€` };
  }

  try {
    const game = await prisma.pFCGame.create({
      data: {
        player1Id: session.user.id,
        player2Id: targetUserId,
        amount: new Prisma.Decimal(amount),
        status: "pending",
        expiresAt: new Date(Date.now() + PFC_CONFIG.CHALLENGE_EXPIRY_MS),
      },
    });

    
    return { success: true, gameId: game.id, serverTime: Date.now() };
  } catch (error) {
    console.error("Create PFC challenge error:", error);
    return { success: false, error: "erreur serveur", serverTime: Date.now() };
  }
}

/**
 * Accepte un défi PFC - ATOMIC with updateMany to prevent race conditions
 */
export async function acceptPFCChallenge(gameId: string): Promise<{ success: boolean; error?: string; serverTime?: number }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté", serverTime: Date.now() };
  }

  const game = await prisma.pFCGame.findUnique({
    where: { id: gameId },
  });

  if (!game || game.player2Id !== session.user.id) {
    return { success: false, error: "défi invalide", serverTime: Date.now() };
  }

  if (new Date() > game.expiresAt) {
    await prisma.pFCGame.update({
      where: { id: gameId },
      data: { status: "expired" },
    });
    return { success: false, error: "défi expiré", serverTime: Date.now() };
  }

  // ATOMIC: Use updateMany to prevent race conditions
  const updateResult = await prisma.pFCGame.updateMany({
    where: { 
      id: gameId, 
      status: "pending" // Only update if still pending
    },
    data: { status: "accepting" } // Temporary lock status
  });

  // If count === 0, another process already accepted
  if (updateResult.count === 0) {
    return { success: false, error: "défi déjà accepté", serverTime: Date.now() };
  }

  // Déduire les mises
  const amount = Number(game.amount);
  
  await prisma.$transaction([
    prisma.user.update({
      where: { id: game.player1Id },
      data: { balance: { decrement: new Prisma.Decimal(amount) } },
    }),
    prisma.user.update({
      where: { id: game.player2Id! },
      data: { balance: { decrement: new Prisma.Decimal(amount) } },
    }),
    prisma.pFCGame.update({
      where: { id: gameId },
      data: { 
        status: "playing",
        expiresAt: new Date(Date.now() + PFC_CONFIG.CHOICE_TIMEOUT_MS),
      },
    }),
  ]);

  
  return { success: true, serverTime: Date.now() };
}

/**
 * Fait un choix dans un jeu PFC - ATOMIC to prevent double-choice race conditions
 */
export async function makePFCChoice(
  gameId: string,
  choice: PFCChoice
): Promise<MakeChoiceResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté", serverTime: Date.now() };
  }

  const game = await prisma.pFCGame.findUnique({
    where: { id: gameId },
  });

  if (!game || game.status !== "playing") {
    return { success: false, error: "jeu invalide", serverTime: Date.now() };
  }

  const isPlayer1 = game.player1Id === session.user.id;
  const isPlayer2 = game.player2Id === session.user.id;

  if (!isPlayer1 && !isPlayer2) {
    return { success: false, error: "tu n'es pas dans ce jeu", serverTime: Date.now() };
  }

  // ATOMIC: Use updateMany to prevent double-choice
  const updateData = isPlayer1
    ? { player1Choice: choice }
    : { player2Choice: choice };
  
  const whereClause = isPlayer1
    ? { id: gameId, player1Choice: null } // Only update if player1 hasn't chosen
    : { id: gameId, player2Choice: null }; // Only update if player2 hasn't chosen

  const updateResult = await prisma.pFCGame.updateMany({
    where: whereClause,
    data: updateData,
  });

  // If count === 0, player already chose
  if (updateResult.count === 0) {
    return { success: false, error: "tu as déjà choisi", serverTime: Date.now() };
  }

  // Fetch updated game
  const updatedGame = await prisma.pFCGame.findUnique({
    where: { id: gameId },
  });

  if (!updatedGame) {
    return { success: false, error: "erreur serveur", serverTime: Date.now() };
  }

  // Vérifier si les deux ont choisi
  const player1Choice = updatedGame.player1Choice;
  const player2Choice = updatedGame.player2Choice;

  if (!player1Choice || !player2Choice) {
    return { success: true, waiting: true, serverTime: Date.now() };
  }

  // Les deux ont choisi - résoudre le jeu
  const result = determinePFCWinner(
    player1Choice as PFCChoice,
    player2Choice as PFCChoice
  );

  const amount = Number(game.amount);
  const winnerId = result === "tie"
    ? null
    : result === "player1"
      ? game.player1Id
      : game.player2Id;

  // Check anti-spam
  const recentGames = game.player2Id ? await prisma.pFCGame.count({
    where: {
      status: "completed",
      completedAt: { gte: new Date(Date.now() - PFC_CONFIG.ANTI_SPAM_WINDOW_MS) },
      OR: [
        { player1Id: game.player1Id, player2Id: game.player2Id },
        { player1Id: game.player2Id, player2Id: game.player1Id },
      ],
    },
  }) : 0;

  const penalty = calculatePenalty(recentGames);

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const player1Winnings = calculatePFCWinnings(amount, result, true, penalty);
    const player2Winnings = calculatePFCWinnings(amount, result, false, penalty);

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

    await tx.pFCGame.update({
      where: { id: gameId },
      data: {
        status: "completed",
        winnerId,
        completedAt: new Date(),
      },
    });

    // Transactions
    await tx.transaction.create({
      data: {
        userId: game.player1Id,
        type: "casino_pfc",
        amount: new Prisma.Decimal(player1Winnings - amount),
        description: `PFC: ${player1Choice} vs ${player2Choice}`,
      },
    });
    await tx.transaction.create({
      data: {
        userId: game.player2Id!,
        type: "casino_pfc",
        amount: new Prisma.Decimal(player2Winnings - amount),
        description: `PFC: ${player2Choice} vs ${player1Choice}`,
      },
    });
  });

  const myProfit = isPlayer1
    ? calculatePFCWinnings(amount, result, true, penalty) - amount
    : calculatePFCWinnings(amount, result, false, penalty) - amount;

  
  return {
    success: true,
    player1Choice: player1Choice as PFCChoice,
    player2Choice: player2Choice as PFCChoice,
    winnerId,
    profit: myProfit,
    serverTime: Date.now(),
  };
}

export interface PlayPFCVsBotResult {
  success: boolean;
  error?: string;
  playerChoice?: PFCChoice;
  botChoice?: PFCChoice;
  won?: boolean;
  tie?: boolean;
  profit?: number;
}

/**
 * Joue PFC contre le bot
 * Le bot choisit 100% aléatoirement - aucun avantage
 */
export async function playPFCVsBot(
  choice: PFCChoice,
  amount: number
): Promise<PlayPFCVsBotResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté" };
  }

  if (amount < PFC_CONFIG.MIN_BET) {
    return { success: false, error: `mise minimum: ${PFC_CONFIG.MIN_BET}€` };
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

  // Bot choisit aléatoirement - 33% chaque option
  const choices: PFCChoice[] = ["pierre", "feuille", "ciseaux"];
  const botChoice = choices[Math.floor(Math.random() * 3)];

  const result = determinePFCWinner(choice, botChoice);
  const winnings = calculatePFCWinnings(amount, result, true);
  const profit = winnings - amount;

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
          type: "casino_pfc",
          amount: new Prisma.Decimal(profit),
          description: `PFC vs Bot: ${choice} vs ${botChoice} - ${result === "player1" ? "Gagné" : result === "tie" ? "Égalité" : "Perdu"}`,
        },
      });
    });

    // Si le joueur a perdu, envoyer la mise à ANTIBANK CORP
    if (result === "player2") {
      addToAntibank(amount, "pfc vs bot - perte joueur").catch(() => {});
    }

    // Track pour la quête heist
    if (result === "player1") {
      trackHeistCasinoWin(session.user.id).catch(() => {});
    } else if (result === "player2") {
      trackHeistCasinoLoss(session.user.id).catch(() => {});
    }

    

    return {
      success: true,
      playerChoice: choice,
      botChoice,
      won: result === "player1",
      tie: result === "tie",
      profit,
    };
  } catch (error) {
    console.error("Play PFC vs bot error:", error);
    return { success: false, error: "erreur serveur" };
  }
}

/**
 * Récupère les défis PFC en attente
 */
export async function getPendingPFCChallenges() {
  const session = await auth();
  if (!session?.user?.id) {
    return { sent: [], received: [], playing: [], waitingResult: [] };
  }

  const [sent, received, playing, waitingResult] = await Promise.all([
    prisma.pFCGame.findMany({
      where: {
        status: "pending",
        expiresAt: { gt: new Date() },
        player1Id: session.user.id,
      },
      include: {
        player2: { select: { id: true, discordUsername: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.pFCGame.findMany({
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
    // Games where I need to make a choice
    prisma.pFCGame.findMany({
      where: {
        status: "playing",
        expiresAt: { gt: new Date() },
        OR: [
          { player1Id: session.user.id, player1Choice: null },
          { player2Id: session.user.id, player2Choice: null },
        ],
      },
      include: {
        player1: { select: { id: true, discordUsername: true } },
        player2: { select: { id: true, discordUsername: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    // Games where I already chose but waiting for opponent
    prisma.pFCGame.findMany({
      where: {
        status: "playing",
        OR: [
          { player1Id: session.user.id, player1Choice: { not: null }, player2Choice: null },
          { player2Id: session.user.id, player2Choice: { not: null }, player1Choice: null },
        ],
      },
      include: {
        player1: { select: { id: true, discordUsername: true } },
        player2: { select: { id: true, discordUsername: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return { sent, received, playing, waitingResult };
}

/**
 * Récupère l'état d'une partie PFC (pour polling)
 */
export async function getPFCGameState(gameId: string): Promise<PFCGameState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté", serverTime: Date.now() };
  }

  const game = await prisma.pFCGame.findUnique({
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
      player1Choice: game.player1Choice,
      player2Choice: game.player2Choice,
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
 * Récupère les parties PFC récemment terminées (pour notification)
 * DEPRECATED: Use getPFCGameState instead for reliable polling
 */
export async function getRecentPFCResults() {
  const session = await auth();
  if (!session?.user?.id) {
    return [];
  }

  // Parties terminées dans les 30 dernières secondes
  const recentGames = await prisma.pFCGame.findMany({
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
    const myChoice = isPlayer1 ? game.player1Choice : game.player2Choice;
    const theirChoice = isPlayer1 ? game.player2Choice : game.player1Choice;
    const opponent = isPlayer1 ? game.player2 : game.player1;
    const amount = Number(game.amount);
    
    const won = game.winnerId === session.user.id;
    const tie = game.winnerId === null;
    const profit = won ? amount * 0.9 : tie ? -amount * 0.05 : -amount;

    return {
      id: game.id,
      myChoice,
      theirChoice,
      opponentName: opponent?.discordUsername || "?",
      won,
      tie,
      profit,
      completedAt: game.completedAt,
    };
  });
}

/**
 * Récupère l'historique des parties PFC
 */
export async function getPFCHistory(limit = 20) {
  const session = await auth();
  if (!session?.user?.id) {
    return [];
  }

  const games = await prisma.pFCGame.findMany({
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
    const myChoice = isPlayer1 ? game.player1Choice : game.player2Choice;
    const theirChoice = isPlayer1 ? game.player2Choice : game.player1Choice;
    const opponent = isPlayer1 ? game.player2 : game.player1;
    const amount = Number(game.amount);
    
    const won = game.winnerId === session.user.id;
    const tie = game.winnerId === null;
    const profit = won ? amount * 0.9 : tie ? -amount * 0.05 : -amount;

    return {
      id: game.id,
      myChoice,
      theirChoice,
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
 * Demande un rematch pour une partie PFC terminée - DETERMINISTIC code system (no voting race conditions)
 * Uses code format: RP{last5chars} - same code for both players
 */
export async function requestPFCRematch(
  gameId: string
): Promise<{ success: boolean; error?: string; code?: string; newGameId?: string; serverTime?: number }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté", serverTime: Date.now() };
  }

  const game = await prisma.pFCGame.findUnique({
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
    return { success: false, error: "partie pas terminée", serverTime: Date.now() };
  }

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
  const rematchCode = `RP${gameId.slice(-5)}`;

  // Get opponent ID safely
  const opponentId = isPlayer1 ? game.player2Id : game.player1Id;
  
  if (!opponentId || !game.player2Id) {
    return { success: false, error: "partie 1v1 uniquement", serverTime: Date.now() };
  }

  // Check if rematch challenge already exists
  const existingRematch = await prisma.pFCGame.findFirst({
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
  const newGame = await prisma.pFCGame.create({
    data: {
      player1Id: session.user.id,
      player2Id: opponentId,
      amount: game.amount,
      status: "pending",
      expiresAt: new Date(Date.now() + PFC_CONFIG.CHALLENGE_EXPIRY_MS),
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
 * Vérifie l'état du rematch pour une partie PFC - DEPRECATED, use getPFCGameState or pending challenges instead
 */
export async function checkPFCRematchStatus(
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

  const game = await prisma.pFCGame.findUnique({
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

  const existingRematch = await prisma.pFCGame.findFirst({
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
