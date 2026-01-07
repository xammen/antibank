"use server";

import { auth } from "@/lib/auth";
import { prisma, Prisma } from "@antibank/db";
import { getCrashManager } from "@/lib/crash-manager";
import { validateBet, calculateMultiplier, timeToMultiplier, CRASH_CONFIG } from "@/lib/crash";
import { revalidatePath } from "next/cache";

export async function placeCrashBet(amount: number): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté" };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, balance: true, discordUsername: true },
  });

  if (!user) {
    return { success: false, error: "utilisateur introuvable" };
  }

  const balance = Number(user.balance);
  const validation = validateBet(amount, balance);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const manager = getCrashManager();
  
  // Check if bets are open
  const canBet = await manager.canBet();
  if (!canBet) {
    return { success: false, error: "paris fermés" };
  }

  // Check if already bet
  const hasBet = await manager.hasPlayerBet(session.user.id);
  if (hasBet) {
    return { success: false, error: "déjà parié" };
  }

  // Deduct from balance first
  await prisma.user.update({
    where: { id: session.user.id },
    data: { balance: { decrement: new Prisma.Decimal(amount) } },
  });

  // Place the bet
  const result = await manager.placeBet(session.user.id, user.discordUsername, amount);
  
  if (!result.success) {
    // Rollback
    await prisma.user.update({
      where: { id: session.user.id },
      data: { balance: { increment: new Prisma.Decimal(amount) } },
    });
  }

  revalidatePath("/casino/crash");
  return result;
}

export async function cashOutCrash(clientMultiplier?: number): Promise<{ 
  success: boolean; 
  error?: string;
  multiplier?: number; 
  profit?: number;
  newBalance?: number;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté" };
  }

  const manager = getCrashManager();
  
  // Pass client multiplier for more accurate timing
  const result = await manager.cashOut(session.user.id, clientMultiplier);
  
  if (result.success && result.profit !== undefined && result.bet !== undefined) {
    // Add winnings to balance
    const winnings = result.bet + result.profit;
    
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: { balance: { increment: new Prisma.Decimal(winnings) } },
    });

    // Log transaction
    await prisma.transaction.create({
      data: {
        userId: session.user.id,
        type: "casino_crash",
        amount: new Prisma.Decimal(result.profit),
        description: `Crash x${result.multiplier?.toFixed(2)}`,
      },
    });

    revalidatePath("/casino/crash");
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
