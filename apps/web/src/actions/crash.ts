"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@antibank/db";
import { Decimal } from "@prisma/client/runtime/library";
import { validateBet } from "@/lib/crash";
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

  // Déduire la mise (Partykit gère le game state, on gère juste la DB)
  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { balance: { decrement: new Decimal(amount) } },
      }),
      prisma.transaction.create({
        data: {
          userId: user.id,
          type: "casino_crash_bet",
          amount: new Decimal(-amount),
          description: `Mise crash game`,
        },
      }),
    ]);

    revalidatePath("/casino/crash");
    return { success: true };
  } catch (error) {
    console.error("Crash bet error:", error);
    return { success: false, error: "erreur serveur" };
  }
}

export async function cashOutCrash(
  multiplier: number,
  profit: number,
  betAmount: number
): Promise<CashOutResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté" };
  }

  // Créditer le gain (Partykit a déjà calculé le profit)
  try {
    const winAmount = profit + betAmount; // Profit + mise initiale
    
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: { balance: { increment: new Decimal(winAmount) } },
    });

    await prisma.transaction.create({
      data: {
        userId: session.user.id,
        type: "casino_crash_win",
        amount: new Decimal(winAmount),
        description: `Crash cashout x${multiplier.toFixed(2)}`,
      },
    });

    revalidatePath("/casino/crash");
    return {
      success: true,
      multiplier,
      profit,
      newBalance: Number(updatedUser.balance),
    };
  } catch (error) {
    console.error("Crash cashout error:", error);
    return { success: false, error: "erreur serveur" };
  }
}
