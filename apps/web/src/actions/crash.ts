"use server";

import { auth } from "@/lib/auth";
import { prisma, Prisma } from "@antibank/db";
import { validateBet } from "@/lib/crash";
import { getCrashManager } from "@/lib/crash-manager";
import { revalidatePath } from "next/cache";

export interface BetResult {
  success: boolean;
  error?: string;
  gameId?: string;
}

export interface CashOutResult {
  success: boolean;
  error?: string;
  multiplier?: number;
  profit?: number;
  newBalance?: number;
}

export async function placeCrashBet(amount: number): Promise<BetResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté" };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (!user) {
    return { success: false, error: "utilisateur introuvable" };
  }

  if (user.isBanned) {
    return { success: false, error: "banni" };
  }

  const balance = Number(user.balance);
  const validation = validateBet(amount, balance);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // Vérifier si le manager accepte les paris
  const manager = getCrashManager();
  if (!manager.canBet()) {
    return { success: false, error: "paris fermés" };
  }

  // Vérifier si le joueur a déjà parié
  if (manager.hasPlayerBet(session.user.id)) {
    return { success: false, error: "déjà parié" };
  }

  try {
    // Déduire la mise
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { balance: { decrement: new Prisma.Decimal(amount) } },
      }),
      prisma.transaction.create({
        data: {
          userId: user.id,
          type: "casino_crash_bet",
          amount: new Prisma.Decimal(-amount),
          description: `Mise crash game`,
        },
      }),
    ]);

    // Ajouter au manager
    const username = user.discordUsername || "anon";
    manager.placeBet(session.user.id, username, amount);

    revalidatePath("/casino/crash");
    return { success: true };
  } catch (error) {
    console.error("Crash bet error:", error);
    return { success: false, error: "erreur serveur" };
  }
}

export async function cashOutCrash(): Promise<CashOutResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté" };
  }

  const manager = getCrashManager();
  const result = manager.cashOut(session.user.id);

  if (!result.success) {
    return { success: false, error: "impossible de cashout" };
  }

  try {
    // Créditer le gain (mise + profit)
    const winAmount = result.bet! + result.profit!;
    
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: { balance: { increment: new Prisma.Decimal(winAmount) } },
    });

    await prisma.transaction.create({
      data: {
        userId: session.user.id,
        type: "casino_crash_win",
        amount: new Prisma.Decimal(winAmount),
        description: `Crash cashout x${result.multiplier!.toFixed(2)}`,
      },
    });

    revalidatePath("/casino/crash");
    return {
      success: true,
      multiplier: result.multiplier,
      profit: result.profit,
      newBalance: Number(updatedUser.balance),
    };
  } catch (error) {
    console.error("Crash cashout error:", error);
    return { success: false, error: "erreur serveur" };
  }
}
