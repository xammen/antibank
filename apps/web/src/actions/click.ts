"use server";

import { prisma } from "@antibank/db";
import { calculateClickBonus } from "@/lib/upgrades";

const BASE_CLICK_VALUE = 0.01;
const MAX_CLICKS_PER_DAY = 5000;

// Anti-triche config (relax)
const MAX_CLICKS_PER_BATCH = 30;        // max clics par batch
const MAX_BATCH_PER_SECOND = 6;         // max batches par seconde
const WINDOW_SIZE_MS = 5000;            // fenêtre de 5 secondes
const MAX_BATCHES_PER_5_SEC = 20;       // max batches sur 5 sec

// Stockage des timestamps de batches par utilisateur
const batchHistory = new Map<string, number[]>();
const suspiciousUsers = new Map<string, number>();

function cleanOldBatches(batches: number[], now: number): number[] {
  return batches.filter(t => now - t < WINDOW_SIZE_MS);
}

export interface ClickBatchResult {
  success: boolean;
  error?: string;
  clicksRemaining?: number;
  totalEarned?: number;
  newBalance?: number;
}

export async function clickBatch(userId: string, count: number): Promise<ClickBatchResult> {
  try {
    const now = Date.now();
    
    // Sanitize count
    count = Math.min(Math.max(1, Math.floor(count)), MAX_CLICKS_PER_BATCH);
    
    // Check si user est flaggé suspect (cooldown de 10 sec)
    const suspiciousTime = suspiciousUsers.get(userId);
    if (suspiciousTime && now - suspiciousTime < 10000) {
      const remaining = Math.ceil((10000 - (now - suspiciousTime)) / 1000);
      return { success: false, error: `calme toi ${remaining}s` };
    }
    
    // Récupère et nettoie l'historique des batches
    let batches = batchHistory.get(userId) || [];
    batches = cleanOldBatches(batches, now);
    
    // Check: max batches dans la dernière seconde
    const batchesLastSecond = batches.filter(t => now - t < 1000).length;
    if (batchesLastSecond >= MAX_BATCH_PER_SECOND) {
      return { success: false, error: "trop rapide" };
    }
    
    // Check: max batches dans les 5 dernières secondes
    if (batches.length >= MAX_BATCHES_PER_5_SEC) {
      suspiciousUsers.set(userId, now);
      return { success: false, error: "ralentis un peu" };
    }
    
    // Ajoute le batch à l'historique
    batches.push(now);
    batchHistory.set(userId, batches);

    // Get user avec ses upgrades
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { upgrades: true },
    });

    if (!user) {
      return { success: false, error: "utilisateur non trouve" };
    }

    if (user.isBanned) {
      return { success: false, error: "banni" };
    }

    // Calcule la valeur du clic avec les upgrades
    const clickBonus = calculateClickBonus(
      user.upgrades.map((u) => ({ upgradeId: u.upgradeId, level: u.level }))
    );
    const CLICK_VALUE = BASE_CLICK_VALUE + clickBonus;

    // Check if we need to reset daily clicks
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastReset = new Date(user.lastClickReset);
    lastReset.setHours(0, 0, 0, 0);

    let clicksToday = user.clicksToday;

    if (today > lastReset) {
      clicksToday = 0;
    }

    // Limite le nombre de clics au max restant
    const clicksRemaining = MAX_CLICKS_PER_DAY - clicksToday;
    if (clicksRemaining <= 0) {
      return { success: false, error: "limite quotidienne atteinte", clicksRemaining: 0 };
    }

    const actualClicks = Math.min(count, clicksRemaining);
    const totalEarned = actualClicks * CLICK_VALUE;

    // Update user balance and clicks
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        balance: { increment: totalEarned },
        clicksToday: clicksToday + actualClicks,
        lastClickReset: today > lastReset ? new Date() : undefined,
      },
    });

    return { 
      success: true, 
      clicksRemaining: MAX_CLICKS_PER_DAY - (clicksToday + actualClicks),
      totalEarned,
      newBalance: Number(updatedUser.balance),
    };
  } catch (error) {
    console.error("Click batch error:", error);
    return { success: false, error: "erreur serveur" };
  }
}

// Legacy single click (pour compatibilité)
export async function click(userId: string): Promise<{ success: boolean; error?: string; clicksRemaining?: number }> {
  return clickBatch(userId, 1);
}
