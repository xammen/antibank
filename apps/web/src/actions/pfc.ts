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
import { revalidatePath } from "next/cache";

export interface CreatePFCResult {
  success: boolean;
  error?: string;
  gameId?: string;
}

export interface MakeChoiceResult {
  success: boolean;
  error?: string;
  player1Choice?: PFCChoice;
  player2Choice?: PFCChoice;
  winnerId?: string | null;
  profit?: number;
  waiting?: boolean;
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

    revalidatePath("/casino/pfc");
    return { success: true, gameId: game.id };
  } catch (error) {
    console.error("Create PFC challenge error:", error);
    return { success: false, error: "erreur serveur" };
  }
}

/**
 * Accepte un défi PFC
 */
export async function acceptPFCChallenge(gameId: string): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté" };
  }

  const game = await prisma.pFCGame.findUnique({
    where: { id: gameId },
  });

  if (!game || game.status !== "pending" || game.player2Id !== session.user.id) {
    return { success: false, error: "défi invalide" };
  }

  if (new Date() > game.expiresAt) {
    await prisma.pFCGame.update({
      where: { id: gameId },
      data: { status: "expired" },
    });
    return { success: false, error: "défi expiré" };
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

  revalidatePath("/casino/pfc");
  return { success: true };
}

/**
 * Fait un choix dans un jeu PFC
 */
export async function makePFCChoice(
  gameId: string,
  choice: PFCChoice
): Promise<MakeChoiceResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté" };
  }

  const game = await prisma.pFCGame.findUnique({
    where: { id: gameId },
  });

  if (!game || game.status !== "playing") {
    return { success: false, error: "jeu invalide" };
  }

  const isPlayer1 = game.player1Id === session.user.id;
  const isPlayer2 = game.player2Id === session.user.id;

  if (!isPlayer1 && !isPlayer2) {
    return { success: false, error: "tu n'es pas dans ce jeu" };
  }

  // Vérifier si le joueur a déjà choisi
  if (isPlayer1 && game.player1Choice) {
    return { success: false, error: "tu as déjà choisi" };
  }
  if (isPlayer2 && game.player2Choice) {
    return { success: false, error: "tu as déjà choisi" };
  }

  // Enregistrer le choix
  const updateData = isPlayer1
    ? { player1Choice: choice }
    : { player2Choice: choice };

  const updatedGame = await prisma.pFCGame.update({
    where: { id: gameId },
    data: updateData,
  });

  // Vérifier si les deux ont choisi
  const player1Choice = isPlayer1 ? choice : updatedGame.player1Choice;
  const player2Choice = isPlayer2 ? choice : updatedGame.player2Choice;

  if (!player1Choice || !player2Choice) {
    return { success: true, waiting: true };
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

  revalidatePath("/casino/pfc");
  return {
    success: true,
    player1Choice: player1Choice as PFCChoice,
    player2Choice: player2Choice as PFCChoice,
    winnerId,
    profit: myProfit,
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

    revalidatePath("/casino/pfc");

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
    return { sent: [], received: [], playing: [] };
  }

  const [sent, received, playing] = await Promise.all([
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
      take: 50, // Pagination: limite à 50 résultats
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
  ]);

  return { sent, received, playing };
}
