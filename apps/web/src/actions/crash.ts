"use server";

import { auth } from "@/lib/auth";
import { prisma, Prisma } from "@antibank/db";
import { getCrashManager } from "@/lib/crash-manager";
import { validateBet } from "@/lib/crash";
import { trackHeistCrashGame, trackHeistCasinoWin } from "@/actions/heist";

export async function placeCrashBet(amount: number): Promise<{ success: boolean; error?: string }> {
  // Paralléliser auth + user fetch
  const [session, manager] = await Promise.all([
    auth(),
    Promise.resolve(getCrashManager()),
  ]);
  
  if (!session?.user?.id) {
    return { success: false, error: "non connecté" };
  }

  // Fetch user + check game state en parallèle
  const [user, gameCheck] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, balance: true, discordUsername: true },
    }),
    manager.canBetAndNotAlreadyBet(session.user.id), // Nouvelle méthode combinée
  ]);

  if (!user) {
    return { success: false, error: "utilisateur introuvable" };
  }

  if (!gameCheck.canBet) {
    return { success: false, error: "paris fermés" };
  }

  if (gameCheck.alreadyBet) {
    return { success: false, error: "déjà parié" };
  }

  const balance = Number(user.balance);
  const validation = validateBet(amount, balance);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // Déduire + placer le bet en une transaction
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: session.user.id },
        data: { balance: { decrement: new Prisma.Decimal(amount) } },
      });
      
      await tx.crashBet.create({
        data: {
          crashGameId: gameCheck.gameId!,
          userId: session.user.id,
          amount: new Prisma.Decimal(amount),
        }
      });
    });

    // Track heist en background (fire and forget)
    if (amount >= 1) {
      trackHeistCrashGame(session.user.id).catch(() => {});
    }

    return { success: true };
  } catch {
    return { success: false, error: "erreur" };
  }
}

export async function cashOutCrash(clientMultiplier?: number): Promise<{ 
  success: boolean; 
  error?: string;
  multiplier?: number; 
  profit?: number;
  newBalance?: number;
}> {
  // Auth + manager en parallèle
  const [session, manager] = await Promise.all([
    auth(),
    Promise.resolve(getCrashManager()),
  ]);
  
  if (!session?.user?.id) {
    return { success: false, error: "non connecté" };
  }

  // CashOut via manager (déjà optimisé)
  const result = await manager.cashOut(session.user.id, clientMultiplier);
  
  if (result.success && result.profit !== undefined && result.bet !== undefined) {
    const winnings = result.bet + result.profit;
    
    // Update balance + log transaction en parallèle
    const [updatedUser] = await Promise.all([
      prisma.user.update({
        where: { id: session.user.id },
        data: { balance: { increment: new Prisma.Decimal(winnings) } },
      }),
      prisma.transaction.create({
        data: {
          userId: session.user.id,
          type: "casino_crash",
          amount: new Prisma.Decimal(result.profit),
          description: `Crash x${result.multiplier?.toFixed(2)}`,
        },
      }),
      // Track heist en background
      result.profit > 0 ? trackHeistCasinoWin(session.user.id).catch(() => {}) : Promise.resolve(),
    ]);

    return { ...result, newBalance: Number(updatedUser.balance) };
  }

  return result;
}

export async function voteSkipCrash(): Promise<{ success: boolean; skipped?: boolean }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false };
  }

  const manager = getCrashManager();
  return manager.voteSkip(session.user.id);
}

export async function getUserCrashHistory(): Promise<Array<{
  crashPoint: number;
  bet: number;
  cashOutAt: number | null;
  profit: number;
  createdAt: Date;
}>> {
  const session = await auth();
  if (!session?.user?.id) {
    return [];
  }

  const manager = getCrashManager();
  return manager.getUserBetHistory(session.user.id, 10);
}
