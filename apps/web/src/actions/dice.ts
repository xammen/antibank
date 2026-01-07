"use server";

import { auth } from "@/lib/auth";
import { prisma, Prisma } from "@antibank/db";
import { rollDice, determineWinner, calculateDiceWinnings, DICE_CONFIG } from "@/lib/dice";
import { revalidatePath } from "next/cache";
import { addToAntibank } from "@/lib/antibank-corp";

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
  player1Dice?: [number, number];
  player2Dice?: [number, number];
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
      player1Dice,
      player2Dice,
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
 * Récupère les parties de dés récemment terminées (pour notification player1)
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
 * Demande un rematch après une partie terminée
 * Si les deux joueurs demandent, une nouvelle partie est automatiquement lancée
 */
export async function requestDiceRematch(
  gameId: string
): Promise<{ success: boolean; error?: string; rematchStarted?: boolean; newGameId?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté" };
  }

  const game = await prisma.diceGame.findUnique({
    where: { id: gameId },
    include: {
      player1: { select: { id: true, balance: true, discordUsername: true } },
      player2: { select: { id: true, balance: true, discordUsername: true } },
    },
  });

  if (!game) {
    return { success: false, error: "partie introuvable" };
  }

  if (game.status !== "completed") {
    return { success: false, error: "partie non terminée" };
  }

  // Vérifier que l'utilisateur était dans la partie
  const isPlayer1 = game.player1Id === session.user.id;
  const isPlayer2 = game.player2Id === session.user.id;
  if (!isPlayer1 && !isPlayer2) {
    return { success: false, error: "tu n'étais pas dans cette partie" };
  }

  // Vérifier que la partie n'est pas trop vieille (max 5 min)
  if (game.completedAt && Date.now() - game.completedAt.getTime() > 5 * 60 * 1000) {
    return { success: false, error: "rematch expiré" };
  }

  const amount = Number(game.amount);

  // Vérifier les soldes
  if (Number(game.player1?.balance) < amount) {
    return { success: false, error: "solde insuffisant (joueur 1)" };
  }
  if (Number(game.player2?.balance) < amount) {
    return { success: false, error: "solde insuffisant (joueur 2)" };
  }

  // Mettre à jour le vote rematch
  const updatedGame = await prisma.diceGame.update({
    where: { id: gameId },
    data: isPlayer1 
      ? { player1WantsRematch: true }
      : { player2WantsRematch: true },
  });

  // Vérifier si les deux joueurs veulent un rematch
  const bothWantRematch = isPlayer1 
    ? (true && updatedGame.player2WantsRematch)
    : (updatedGame.player1WantsRematch && true);

  if (bothWantRematch) {
    // Créer automatiquement une nouvelle partie
    const newGame = await prisma.diceGame.create({
      data: {
        player1Id: game.player1Id,
        player2Id: game.player2Id!,
        amount: game.amount,
        status: "pending",
        expiresAt: new Date(Date.now() + 30000), // 30s pour accepter
      },
    });

    // Reset les votes sur l'ancienne partie
    await prisma.diceGame.update({
      where: { id: gameId },
      data: { player1WantsRematch: false, player2WantsRematch: false },
    });

    return { success: true, rematchStarted: true, newGameId: newGame.id };
  }

  return { success: true, rematchStarted: false };
}

/**
 * Vérifie l'état du rematch pour une partie
 */
export async function checkDiceRematchStatus(
  gameId: string
): Promise<{ 
  canRematch: boolean; 
  myVote: boolean; 
  theirVote: boolean;
  opponentId?: string;
  opponentName?: string;
  amount?: number;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { canRematch: false, myVote: false, theirVote: false };
  }

  const game = await prisma.diceGame.findUnique({
    where: { id: gameId },
    include: {
      player1: { select: { id: true, discordUsername: true } },
      player2: { select: { id: true, discordUsername: true } },
    },
  });

  if (!game || game.status !== "completed") {
    return { canRematch: false, myVote: false, theirVote: false };
  }

  // Vérifier que la partie n'est pas trop vieille
  if (game.completedAt && Date.now() - game.completedAt.getTime() > 5 * 60 * 1000) {
    return { canRematch: false, myVote: false, theirVote: false };
  }

  const isPlayer1 = game.player1Id === session.user.id;
  const isPlayer2 = game.player2Id === session.user.id;

  if (!isPlayer1 && !isPlayer2) {
    return { canRematch: false, myVote: false, theirVote: false };
  }

  const myVote = isPlayer1 ? game.player1WantsRematch : game.player2WantsRematch;
  const theirVote = isPlayer1 ? game.player2WantsRematch : game.player1WantsRematch;
  const opponent = isPlayer1 ? game.player2 : game.player1;

  return { 
    canRematch: true, 
    myVote, 
    theirVote,
    opponentId: opponent?.id,
    opponentName: opponent?.discordUsername,
    amount: Number(game.amount),
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
