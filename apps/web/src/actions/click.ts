"use server";

import { prisma, Prisma } from "@antibank/db";
import { calculateClickBonus } from "@/lib/upgrades";

const BASE_CLICK_VALUE = 0.01;
const MAX_CLICKS_PER_DAY = 1000;

// Anti-triche config
const MAX_CLICKS_PER_SECOND = 18;      // burst max
const MAX_CLICKS_PER_5_SEC = 60;       // moyenne ~12/sec sur 5 sec
const WINDOW_SIZE_MS = 5000;           // fenêtre de 5 secondes
const MIN_VARIANCE_THRESHOLD = 5;      // variance min entre clics (anti-bot)

// Stockage des timestamps de clics par utilisateur
const clickHistory = new Map<string, number[]>();
const suspiciousUsers = new Map<string, number>(); // userId -> timestamp du flag

function cleanOldClicks(clicks: number[], now: number): number[] {
  return clicks.filter(t => now - t < WINDOW_SIZE_MS);
}

function detectBotPattern(clicks: number[]): boolean {
  if (clicks.length < 10) return false;
  
  // Calcule les intervalles entre clics
  const intervals: number[] = [];
  for (let i = 1; i < clicks.length; i++) {
    intervals.push(clicks[i] - clicks[i - 1]);
  }
  
  // Calcule la variance des intervalles
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / intervals.length;
  
  // Si la variance est trop faible = clics trop réguliers = bot
  return variance < MIN_VARIANCE_THRESHOLD;
}

export async function click(userId: string): Promise<{ success: boolean; error?: string; clicksRemaining?: number }> {
  try {
    const now = Date.now();
    
    // Check si user est flaggé suspect (cooldown de 30 sec)
    const suspiciousTime = suspiciousUsers.get(userId);
    if (suspiciousTime && now - suspiciousTime < 30000) {
      const remaining = Math.ceil((30000 - (now - suspiciousTime)) / 1000);
      return { success: false, error: `spam detecte, attends ${remaining}s` };
    }
    
    // Récupère et nettoie l'historique des clics
    let clicks = clickHistory.get(userId) || [];
    clicks = cleanOldClicks(clicks, now);
    
    // Check: max 18 clics dans la dernière seconde
    const clicksLastSecond = clicks.filter(t => now - t < 1000).length;
    if (clicksLastSecond >= MAX_CLICKS_PER_SECOND) {
      return { success: false, error: "trop rapide" };
    }
    
    // Check: max 60 clics dans les 5 dernières secondes
    if (clicks.length >= MAX_CLICKS_PER_5_SEC) {
      suspiciousUsers.set(userId, now);
      return { success: false, error: "ralentis un peu" };
    }
    
    // Check: pattern de bot (clics trop réguliers)
    if (detectBotPattern(clicks)) {
      suspiciousUsers.set(userId, now);
      return { success: false, error: "hmm..." };
    }
    
    // Ajoute le clic à l'historique
    clicks.push(now);
    clickHistory.set(userId, clicks);

    // Get user avec ses upgrades
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { upgrades: true },
    });

    if (!user) {
      return { success: false, error: "utilisateur non trouve" };
    }

    // Calcule la valeur du clic avec les upgrades
    const clickBonus = calculateClickBonus(
      user.upgrades.map((u) => ({ upgradeId: u.upgradeId, level: u.level }))
    );
    const CLICK_VALUE = BASE_CLICK_VALUE + clickBonus;

    if (user.isBanned) {
      return { success: false, error: "banni" };
    }

    // Check if we need to reset daily clicks
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastReset = new Date(user.lastClickReset);
    lastReset.setHours(0, 0, 0, 0);

    let clicksToday = user.clicksToday;

    if (today > lastReset) {
      // New day, reset clicks
      clicksToday = 0;
    }

    if (clicksToday >= MAX_CLICKS_PER_DAY) {
      return { success: false, error: "limite quotidienne atteinte", clicksRemaining: 0 };
    }

    // Update user balance and clicks in transaction
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          balance: { increment: new Prisma.Decimal(CLICK_VALUE) },
          clicksToday: clicksToday + 1,
          lastClickReset: today > lastReset ? new Date() : undefined,
        },
      }),
      prisma.transaction.create({
        data: {
          userId,
          type: "click",
          amount: new Prisma.Decimal(CLICK_VALUE),
          description: `clic #${clicksToday + 1}`,
        },
      }),
    ]);

    return { success: true, clicksRemaining: MAX_CLICKS_PER_DAY - (clicksToday + 1) };
  } catch (error) {
    console.error("Click error:", error);
    return { success: false, error: "erreur serveur" };
  }
}
