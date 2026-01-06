"use server";

import { auth } from "@/lib/auth";
import { prisma, Prisma } from "@antibank/db";
import { rollDice, determineWinner, calculateDiceWinnings, DICE_CONFIG } from "@/lib/dice";
import { revalidatePath } from "next/cache";

export interface CreateChallengeResult {
  success: boolean;
  error?: string;
  gameId?: string;
}

export interface AcceptChallengeResult {
  success: boolean;
  error?: string;
  player1Roll?: number;
  player2Roll?: number;
  winnerId?: string | null;
  profit?: number;
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

    revalidatePath("/casino/dice");
    return { success: true, gameId: game.id };
  } catch (error) {
    console.error("Create dice challenge error:", error);
    return { success: false, error: "erreur serveur" };
  }
}

/**
 * Accepte un défi de dés
 */
export async function acceptDiceChallenge(
  gameId: string
): Promise<AcceptChallengeResult> {
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

  if (game.status !== "pending") {
    return { success: false, error: "défi déjà traité" };
  }

  if (game.player2Id !== session.user.id) {
    return { success: false, error: "ce défi n'est pas pour toi" };
  }

  if (new Date() > game.expiresAt) {
    await prisma.diceGame.update({
      where: { id: gameId },
      data: { status: "expired" },
    });
    return { success: false, error: "défi expiré" };
  }

  // Lancer les dés
  const player1Roll = rollDice();
  const player2Roll = rollDice();
  const result = determineWinner(player1Roll, player2Roll);
  
  const amount = Number(game.amount);
  const winnerId = result === "tie" 
    ? null 
    : result === "player1" 
      ? game.player1Id 
      : game.player2Id;

  try {
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

    revalidatePath("/casino/dice");
    return {
      success: true,
      player1Roll,
      player2Roll,
      winnerId,
      profit: myProfit,
    };
  } catch (error) {
    console.error("Accept dice challenge error:", error);
    return { success: false, error: "erreur serveur" };
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

  revalidatePath("/casino/dice");
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

    revalidatePath("/casino/dice");

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
