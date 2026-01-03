"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@antibank/db";
import { Decimal } from "@prisma/client/runtime/library";
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

  const manager = getCrashManager();
  
  if (!manager.canBet()) {
    return { success: false, error: "paris fermés" };
  }

  // Déduire la mise
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

    const placed = manager.placeBet(
      user.id,
      user.discordUsername,
      amount
    );

    if (!placed) {
      // Rembourser si le bet n'a pas pu être placé
      await prisma.user.update({
        where: { id: user.id },
        data: { balance: { increment: new Decimal(amount) } },
      });
      return { success: false, error: "impossible de placer le pari" };
    }

    revalidatePath("/casino/crash");
    return { success: true, gameId: manager.getPublicState().id };
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
    return { success: false, error: "impossible de cash out" };
  }

  // Créditer le gain
  try {
    const winAmount = result.profit! + getPlayerBet(session.user.id);
    
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: { balance: { increment: new Decimal(winAmount) } },
    });

    await prisma.transaction.create({
      data: {
        userId: session.user.id,
        type: "casino_crash_win",
        amount: new Decimal(winAmount),
        description: `Crash cashout x${result.multiplier?.toFixed(2)}`,
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

function getPlayerBet(userId: string): number {
  const state = getCrashManager().getPublicState();
  const player = state.players.find((p) => p.odrzerId === userId);
  return player?.bet || 0;
}
