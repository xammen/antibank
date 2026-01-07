"use server";

import { prisma } from "@antibank/db";
import { auth } from "@/lib/auth";
import { HEIST_CONFIG } from "@/lib/heist-config";

// ============================================
// TYPES
// ============================================

export interface HeistStageStatus {
  stage: number;
  name: string;
  complete: boolean;
  requirements: {
    id: string;
    label: string;
    current: number;
    required: number;
    complete: boolean;
  }[];
}

export interface HeistProgress {
  // Raw data
  voiceMinutes: number;
  crashGamesPlayed: number;
  successfulRobberies: number;
  fastClicksAt: Date | null;
  casinoWinStreak: number;
  bestWinStreak: number;
  survivedRobbery: boolean;
  lastHeistAt: Date | null;
  totalHeistAttempts: number;
  totalHeistSuccesses: number;
  
  // Computed
  stages: HeistStageStatus[];
  currentStage: number;
  canAttemptHeist: boolean;
  cooldownEndsAt: number | null;
  
  // Active bonuses
  bonuses: {
    chanceBonus: number;
    lootBonus: number;
    lossReduction: number;
  };
  
  // Final stats for heist
  finalStats: {
    successChance: number;
    treasurySteal: number;
    failLoss: number;
  };
}

// ============================================
// GET HEIST PROGRESS
// ============================================

export async function getHeistProgress(): Promise<HeistProgress | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  
  const userId = session.user.id;
  
  // Get or create heist progress
  let progress = await prisma.heistProgress.findUnique({
    where: { userId },
  });
  
  if (!progress) {
    progress = await prisma.heistProgress.create({
      data: { userId },
    });
  }
  
  // Get user data for live checks
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { balance: true },
  });
  
  // Get inventory for stage 3
  const inventory = await prisma.inventoryItem.findMany({
    where: { 
      userId,
      charges: { not: 0 },
    },
    select: { itemId: true, charges: true, expiresAt: true },
  });
  
  const hasItem = (itemId: string) => {
    const item = inventory.find(i => i.itemId === itemId);
    if (!item) return false;
    if (item.expiresAt && item.expiresAt < new Date()) return false;
    return item.charges !== 0;
  };
  
  // Get voice session for stage 5
  const voiceSession = await prisma.voiceSession.findFirst({
    where: { 
      discordId: session.user.discordId || "",
    },
    select: { othersCount: true },
  });
  
  const balance = Number(user?.balance || 0);
  
  // Build stages
  const stages: HeistStageStatus[] = [];
  
  // Stage 1: Reconnaissance
  const stage1Requirements = [
    {
      id: "voice",
      label: "temps en vocal",
      current: progress.voiceMinutes,
      required: HEIST_CONFIG.VOICE_MINUTES_REQUIRED,
      complete: progress.voiceMinutes >= HEIST_CONFIG.VOICE_MINUTES_REQUIRED,
    },
    {
      id: "crash",
      label: "parties de crash",
      current: progress.crashGamesPlayed,
      required: HEIST_CONFIG.CRASH_GAMES_REQUIRED,
      complete: progress.crashGamesPlayed >= HEIST_CONFIG.CRASH_GAMES_REQUIRED,
    },
  ];
  const stage1Complete = stage1Requirements.every(r => r.complete);
  stages.push({
    stage: 1,
    name: "reconnaissance",
    complete: stage1Complete || progress.stage1Complete,
    requirements: stage1Requirements,
  });
  
  // Stage 2: Financement
  const stage2Requirements = [
    {
      id: "balance",
      label: "balance",
      current: balance,
      required: HEIST_CONFIG.BALANCE_REQUIRED,
      complete: balance >= HEIST_CONFIG.BALANCE_REQUIRED,
    },
    {
      id: "robberies",
      label: "braquages reussis",
      current: progress.successfulRobberies,
      required: HEIST_CONFIG.ROBBERIES_REQUIRED,
      complete: progress.successfulRobberies >= HEIST_CONFIG.ROBBERIES_REQUIRED,
    },
  ];
  const stage2Complete = stage2Requirements.every(r => r.complete);
  stages.push({
    stage: 2,
    name: "financement",
    complete: (stage1Complete || progress.stage1Complete) && (stage2Complete || progress.stage2Complete),
    requirements: stage2Requirements,
  });
  
  // Stage 3: Équipement
  const hasPiedDeBiche = hasItem("pied_de_biche");
  const hasKitCrochetage = hasItem("kit_crochetage");
  const hasGilet = hasItem("gilet_pare_balles");
  const hasVpn = hasItem("vpn");
  
  const stage3Requirements = [
    {
      id: "pied_de_biche",
      label: "pied-de-biche",
      current: hasPiedDeBiche ? 1 : 0,
      required: 1,
      complete: hasPiedDeBiche,
    },
    {
      id: "kit_crochetage",
      label: "kit de crochetage",
      current: hasKitCrochetage ? 1 : 0,
      required: 1,
      complete: hasKitCrochetage,
    },
  ];
  const stage3Complete = stage3Requirements.every(r => r.complete);
  stages.push({
    stage: 3,
    name: "equipement",
    complete: stages[1].complete && stage3Complete,
    requirements: [
      ...stage3Requirements,
      {
        id: "gilet_pare_balles",
        label: "gilet pare-balles (optionnel: +10% chance)",
        current: hasGilet ? 1 : 0,
        required: 1,
        complete: hasGilet,
      },
      {
        id: "vpn",
        label: "vpn (optionnel: -20% perte si echec)",
        current: hasVpn ? 1 : 0,
        required: 1,
        complete: hasVpn,
      },
    ],
  });
  
  // Stage 4: Boosters
  const now = Date.now();
  const fastClicksValid = progress.fastClicksAt && 
    (now - progress.fastClicksAt.getTime()) < HEIST_CONFIG.BOOSTER_EXPIRY;
  const winStreakValid = progress.bestWinStreak >= HEIST_CONFIG.WIN_STREAK_REQUIRED;
  
  const stage4Requirements = [
    {
      id: "fast_clicks",
      label: `5000 clics en <20min${fastClicksValid ? " (actif)" : ""}`,
      current: fastClicksValid ? 5000 : 0,
      required: HEIST_CONFIG.FAST_CLICKS_REQUIRED,
      complete: !!fastClicksValid,
    },
    {
      id: "win_streak",
      label: "5 victoires casino d'affilee",
      current: progress.bestWinStreak,
      required: HEIST_CONFIG.WIN_STREAK_REQUIRED,
      complete: winStreakValid,
    },
    {
      id: "survived",
      label: "survivre a un braquage",
      current: progress.survivedRobbery ? 1 : 0,
      required: 1,
      complete: progress.survivedRobbery,
    },
  ];
  stages.push({
    stage: 4,
    name: "boosters",
    complete: stages[2].complete, // Stage 4 is always "complete" for progression, boosters are optional
    requirements: stage4Requirements,
  });
  
  // Stage 5: Lancement
  const othersInVoice = voiceSession?.othersCount || 0;
  const stage5Requirements = [
    {
      id: "voice_others",
      label: "en vocal avec 2+ personnes",
      current: othersInVoice,
      required: HEIST_CONFIG.VOICE_OTHERS_REQUIRED,
      complete: othersInVoice >= HEIST_CONFIG.VOICE_OTHERS_REQUIRED,
    },
    {
      id: "entry_fee",
      label: "frais d'entree (100€)",
      current: balance >= HEIST_CONFIG.ENTRY_FEE ? 100 : balance,
      required: HEIST_CONFIG.ENTRY_FEE,
      complete: balance >= HEIST_CONFIG.ENTRY_FEE,
    },
  ];
  stages.push({
    stage: 5,
    name: "lancement",
    complete: false, // Never "complete" - it's the action stage
    requirements: stage5Requirements,
  });
  
  // Calculate current stage
  let currentStage = 1;
  if (stages[0].complete) currentStage = 2;
  if (stages[1].complete) currentStage = 3;
  if (stages[2].complete) currentStage = 4;
  if (stages[3].complete) currentStage = 5;
  
  // Calculate bonuses
  let chanceBonus = 0;
  let lootBonus = 0;
  let lossReduction = 0;
  
  // Stage 3 optional items
  if (hasGilet) chanceBonus += HEIST_CONFIG.GILET_CHANCE_BONUS;
  if (hasVpn) lossReduction += HEIST_CONFIG.VPN_LOSS_REDUCTION;
  
  // Stage 4 boosters
  if (fastClicksValid) lootBonus += HEIST_CONFIG.FAST_CLICKS_LOOT_BONUS;
  if (winStreakValid) lootBonus += HEIST_CONFIG.WIN_STREAK_LOOT_BONUS;
  if (progress.survivedRobbery) chanceBonus += HEIST_CONFIG.SURVIVED_CHANCE_BONUS;
  
  // Calculate cooldown
  let cooldownEndsAt: number | null = null;
  if (progress.lastHeistAt) {
    const cooldownMs = HEIST_CONFIG.COOLDOWN_HOURS * 60 * 60 * 1000;
    const endsAt = progress.lastHeistAt.getTime() + cooldownMs;
    if (endsAt > now) {
      cooldownEndsAt = endsAt;
    }
  }
  
  // Can attempt heist?
  const allStagesReady = stages[2].complete; // Stage 3 complete means ready for boosters + launch
  const stage5Ready = stage5Requirements.every(r => r.complete);
  const notOnCooldown = !cooldownEndsAt;
  const canAttemptHeist = allStagesReady && stage5Ready && notOnCooldown;
  
  // Final stats
  const finalStats = {
    successChance: HEIST_CONFIG.BASE_SUCCESS_CHANCE + chanceBonus,
    treasurySteal: HEIST_CONFIG.BASE_TREASURY_STEAL + lootBonus,
    failLoss: HEIST_CONFIG.BASE_FAIL_LOSS - lossReduction,
  };
  
  return {
    voiceMinutes: progress.voiceMinutes,
    crashGamesPlayed: progress.crashGamesPlayed,
    successfulRobberies: progress.successfulRobberies,
    fastClicksAt: progress.fastClicksAt,
    casinoWinStreak: progress.casinoWinStreak,
    bestWinStreak: progress.bestWinStreak,
    survivedRobbery: progress.survivedRobbery,
    lastHeistAt: progress.lastHeistAt,
    totalHeistAttempts: progress.totalHeistAttempts,
    totalHeistSuccesses: progress.totalHeistSuccesses,
    stages,
    currentStage,
    canAttemptHeist,
    cooldownEndsAt,
    bonuses: { chanceBonus, lootBonus, lossReduction },
    finalStats,
  };
}

// ============================================
// TRACKING FUNCTIONS (called from other actions)
// ============================================

/**
 * Track voice minutes for heist progress
 * Called from bot when user is in voice with others
 */
export async function trackHeistVoiceMinutes(userId: string, minutes: number): Promise<void> {
  const progress = await prisma.heistProgress.findUnique({
    where: { userId },
    select: { stage1Complete: true },
  });
  
  // Don't track if stage 1 already complete
  if (progress?.stage1Complete) return;
  
  await prisma.heistProgress.upsert({
    where: { userId },
    create: { 
      userId, 
      voiceMinutes: minutes,
    },
    update: {
      voiceMinutes: { increment: minutes },
    },
  });
  
  // Check if stage 1 now complete
  await checkAndCompleteStage1(userId);
}

/**
 * Track crash game played for heist progress
 * Called from crash-manager when bet is placed (with amount >= 1€)
 */
export async function trackHeistCrashGame(userId: string): Promise<void> {
  const progress = await prisma.heistProgress.findUnique({
    where: { userId },
    select: { stage1Complete: true },
  });
  
  if (progress?.stage1Complete) return;
  
  await prisma.heistProgress.upsert({
    where: { userId },
    create: { 
      userId, 
      crashGamesPlayed: 1,
    },
    update: {
      crashGamesPlayed: { increment: 1 },
    },
  });
  
  await checkAndCompleteStage1(userId);
}

/**
 * Track successful robbery for heist progress
 * Called from robbery.ts when a P2P robbery succeeds
 */
export async function trackHeistRobberySuccess(userId: string): Promise<void> {
  const progress = await prisma.heistProgress.findUnique({
    where: { userId },
    select: { stage2Complete: true },
  });
  
  if (progress?.stage2Complete) return;
  
  await prisma.heistProgress.upsert({
    where: { userId },
    create: { 
      userId, 
      successfulRobberies: 1,
    },
    update: {
      successfulRobberies: { increment: 1 },
    },
  });
}

/**
 * Track casino win for win streak
 * Called from dice.ts, pfc.ts, crash-manager.ts when user wins
 */
export async function trackHeistCasinoWin(userId: string): Promise<void> {
  const progress = await prisma.heistProgress.upsert({
    where: { userId },
    create: { 
      userId, 
      casinoWinStreak: 1,
      bestWinStreak: 1,
    },
    update: {
      casinoWinStreak: { increment: 1 },
    },
  });
  
  // Update best streak if current is higher
  const newStreak = (progress.casinoWinStreak || 0) + 1;
  if (newStreak > (progress.bestWinStreak || 0)) {
    await prisma.heistProgress.update({
      where: { userId },
      data: { bestWinStreak: newStreak },
    });
  }
}

/**
 * Reset casino win streak on loss
 * Called from dice.ts, pfc.ts, crash-manager.ts when user loses
 */
export async function trackHeistCasinoLoss(userId: string): Promise<void> {
  await prisma.heistProgress.upsert({
    where: { userId },
    create: { userId },
    update: { casinoWinStreak: 0 },
  });
}

/**
 * Track fast clicks achievement
 * Called from click.ts when user reaches 5000 clicks
 */
export async function trackHeistFastClicks(userId: string, clicksInSession: number, sessionStartTime: Date): Promise<void> {
  if (clicksInSession < HEIST_CONFIG.FAST_CLICKS_REQUIRED) return;
  
  const elapsed = Date.now() - sessionStartTime.getTime();
  if (elapsed > HEIST_CONFIG.FAST_CLICKS_TIME_LIMIT) return;
  
  await prisma.heistProgress.upsert({
    where: { userId },
    create: { 
      userId, 
      fastClicksAt: new Date(),
    },
    update: {
      fastClicksAt: new Date(),
    },
  });
}

/**
 * Track survived robbery (was victim but robber failed)
 * Called from robbery.ts when robbery fails and user was victim
 */
export async function trackHeistSurvivedRobbery(userId: string): Promise<void> {
  await prisma.heistProgress.upsert({
    where: { userId },
    create: { 
      userId, 
      survivedRobbery: true,
    },
    update: {
      survivedRobbery: true,
    },
  });
}

/**
 * Reset boosters after heist attempt
 * Called from robbery.ts after ANTIBANK heist
 */
export async function resetHeistBoosters(userId: string): Promise<void> {
  await prisma.heistProgress.update({
    where: { userId },
    data: {
      fastClicksAt: null,
      casinoWinStreak: 0,
      bestWinStreak: 0,
      survivedRobbery: false,
    },
  });
}

/**
 * Record heist attempt
 */
export async function recordHeistAttempt(userId: string, success: boolean): Promise<void> {
  await prisma.heistProgress.update({
    where: { userId },
    data: {
      lastHeistAt: new Date(),
      totalHeistAttempts: { increment: 1 },
      ...(success ? { totalHeistSuccesses: { increment: 1 } } : {}),
    },
  });
}

// ============================================
// HELPER FUNCTIONS
// ============================================

async function checkAndCompleteStage1(userId: string): Promise<void> {
  const progress = await prisma.heistProgress.findUnique({
    where: { userId },
    select: { 
      voiceMinutes: true, 
      crashGamesPlayed: true,
      stage1Complete: true,
    },
  });
  
  if (!progress || progress.stage1Complete) return;
  
  if (
    progress.voiceMinutes >= HEIST_CONFIG.VOICE_MINUTES_REQUIRED &&
    progress.crashGamesPlayed >= HEIST_CONFIG.CRASH_GAMES_REQUIRED
  ) {
    await prisma.heistProgress.update({
      where: { userId },
      data: { stage1Complete: true },
    });
  }
}

/**
 * Complete stage 2 check (called when balance or robberies change)
 */
export async function checkAndCompleteStage2(userId: string): Promise<void> {
  const progress = await prisma.heistProgress.findUnique({
    where: { userId },
    select: { 
      stage1Complete: true,
      stage2Complete: true,
      successfulRobberies: true,
    },
  });
  
  if (!progress || !progress.stage1Complete || progress.stage2Complete) return;
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { balance: true },
  });
  
  const balance = Number(user?.balance || 0);
  
  if (
    balance >= HEIST_CONFIG.BALANCE_REQUIRED &&
    progress.successfulRobberies >= HEIST_CONFIG.ROBBERIES_REQUIRED
  ) {
    await prisma.heistProgress.update({
      where: { userId },
      data: { stage2Complete: true },
    });
  }
}
