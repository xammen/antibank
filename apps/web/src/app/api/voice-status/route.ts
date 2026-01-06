import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@antibank/db";
import { 
  calculateVoiceEarnings, 
  getDailyBonus, 
  getNextTier, 
  getStreakBonus,
  isHappyHour,
} from "@/lib/voice-bonus";
import { calculateVocalBonus } from "@/lib/upgrades";

export async function GET() {
  const session = await auth();
  
  if (!session?.user?.discordId || !session?.user?.id) {
    return NextResponse.json({ inVoice: false });
  }

  // Récupérer la session vocale
  const voiceSession = await prisma.voiceSession.findUnique({
    where: { discordId: session.user.discordId },
  });

  // Récupérer les infos user (upgrades, daily voice, streak)
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { upgrades: true },
  });

  if (!user) {
    return NextResponse.json({ inVoice: false });
  }

  // Calculer le bonus d'upgrade vocal
  const upgradeBonus = calculateVocalBonus(
    user.upgrades.map((u) => ({ upgradeId: u.upgradeId, level: u.level }))
  );

  // Check si on doit reset le daily
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userData = user as any;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastReset = new Date(userData.lastVoiceReset || new Date());
  lastReset.setHours(0, 0, 0, 0);
  
  let dailyVoiceMinutes = userData.dailyVoiceMinutes || 0;
  let voiceStreak = userData.voiceStreak || 0;
  
  if (today > lastReset) {
    // Nouveau jour - check si on garde le streak
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Si hier on a fait 30+ min, on garde/incrémente le streak
    // Sinon on reset
    if (dailyVoiceMinutes >= 30) {
      // Le streak sera incrémenté par le bot quand il credite
    } else {
      voiceStreak = 0;
    }
    dailyVoiceMinutes = 0;
  }

  // Si pas en vocal, retourner quand même les stats journalières
  if (!voiceSession) {
    return NextResponse.json({
      inVoice: false,
      dailyVoiceMinutes,
      dailyBonus: getDailyBonus(dailyVoiceMinutes),
      nextTier: getNextTier(dailyVoiceMinutes),
      voiceStreak,
      streakBonus: getStreakBonus(voiceStreak),
      totalVoiceMinutes: userData.totalVoiceMinutes || 0,
    });
  }

  // Calcul durée de session
  const sessionStarted = new Date(voiceSession.joinedAt);
  const sessionSeconds = Math.floor((Date.now() - sessionStarted.getTime()) / 1000);
  const sessionMinutes = Math.floor(sessionSeconds / 60);

  // Calcul des gains avec tous les bonus
  const earnings = calculateVoiceEarnings(
    sessionMinutes,
    voiceSession.othersCount,
    upgradeBonus
  );

  return NextResponse.json({
    inVoice: true,
    channelName: voiceSession.channelName,
    othersCount: voiceSession.othersCount,
    
    // Session actuelle
    sessionSeconds,
    sessionMinutes,
    joinedAt: voiceSession.joinedAt.toISOString(),
    
    // Gains
    earningsPerMin: earnings.finalRate.toFixed(2),
    baseRate: earnings.baseRate,
    sessionMultiplier: earnings.sessionMultiplier,
    happyHourMultiplier: earnings.happyHourMultiplier,
    isHappyHour: isHappyHour(),
    
    // Stats journalières
    dailyVoiceMinutes: dailyVoiceMinutes + sessionMinutes,
    dailyBonus: getDailyBonus(dailyVoiceMinutes + sessionMinutes),
    nextTier: getNextTier(dailyVoiceMinutes + sessionMinutes),
    
    // Streak
    voiceStreak,
    streakBonus: getStreakBonus(voiceStreak),
    
    // Total
    totalVoiceMinutes: (userData.totalVoiceMinutes || 0) + sessionMinutes,
  });
}
