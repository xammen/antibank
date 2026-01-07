// Bonus multiplicateur par durée de session continue
// Jusqu'à 8h: multiplicateur croissant (max x3.5 à 8h)
// Après 8h: on reste à x3.5 mais +0.05 par heure supplémentaire (léger)
const SESSION_CAP_MINUTES = 480; // 8h
const MAX_MULTIPLIER = 3.5;      // x3.5 à 8h
const OVERTIME_BONUS = 0.05;     // +0.05 par heure après 8h

export function getSessionMultiplier(sessionMinutes: number): number {
  if (sessionMinutes < 30) return 1.0;
  if (sessionMinutes < 60) return 1.25;   // 30 min
  if (sessionMinutes < 120) return 1.5;   // 1h
  if (sessionMinutes < 180) return 2.0;   // 2h
  
  if (sessionMinutes < SESSION_CAP_MINUTES) {
    // 3h-8h : x2.0 + 0.25 par heure supplémentaire
    const extraHours = Math.floor((sessionMinutes - 180) / 60);
    return 2.0 + (extraHours + 1) * 0.25;
  }
  
  // Après 8h: x3.5 + petit bonus par heure
  const overtimeHours = Math.floor((sessionMinutes - SESSION_CAP_MINUTES) / 60);
  return MAX_MULTIPLIER + overtimeHours * OVERTIME_BONUS;
}

// Bonus journalier en € (temps cumulé)
export function getDailyBonus(dailyMinutes: number): number {
  if (dailyMinutes < 30) return 0;
  if (dailyMinutes < 60) return 0.5;      // 30 min
  if (dailyMinutes < 120) return 1.5;     // 1h
  if (dailyMinutes < 180) return 4;       // 2h
  if (dailyMinutes < 240) return 8;       // 3h
  // 4h+ : 8€ + 3€ par heure supplémentaire
  const extraHours = Math.floor((dailyMinutes - 240) / 60);
  return 8 + (extraHours + 1) * 3;
}

// Paliers pour affichage
export const DAILY_BONUS_TIERS = [
  { minutes: 30, bonus: 0.5, label: "30 min" },
  { minutes: 60, bonus: 1.5, label: "1h" },
  { minutes: 120, bonus: 4, label: "2h" },
  { minutes: 180, bonus: 8, label: "3h" },
  { minutes: 240, bonus: 11, label: "4h" },
];

// Prochain palier
export function getNextTier(dailyMinutes: number): { minutes: number; bonus: number; label: string } | null {
  for (const tier of DAILY_BONUS_TIERS) {
    if (dailyMinutes < tier.minutes) {
      return tier;
    }
  }
  // Après 4h, prochain palier = +1h
  const nextHour = Math.ceil((dailyMinutes + 1) / 60) * 60;
  return {
    minutes: nextHour,
    bonus: getDailyBonus(nextHour),
    label: `${nextHour / 60}h`,
  };
}

// Bonus streak (jours consécutifs avec 30+ min de vocal)
export function getStreakBonus(streakDays: number): number {
  if (streakDays < 2) return 0;
  if (streakDays < 5) return 0.5;    // 2-4 jours
  if (streakDays < 10) return 1;     // 5-9 jours
  if (streakDays < 20) return 2;     // 10-19 jours
  return 3 + Math.floor((streakDays - 20) / 10); // +1€ tous les 10 jours après 20
}

// Happy Hour (20h-23h) - bonus x1.5
export function isHappyHour(): boolean {
  const hour = new Date().getHours();
  return hour >= 20 && hour < 23;
}

export function getHappyHourMultiplier(): number {
  return isHappyHour() ? 1.5 : 1.0;
}

// Calcul du gain par minute avec tous les bonus
export interface VoiceEarningsInfo {
  baseRate: number;           // Taux de base (0.05)
  othersBonus: number;        // Bonus par personne
  sessionMultiplier: number;  // x1.0 à x2.5+
  happyHourMultiplier: number;// x1.0 ou x1.5
  upgradeBonus: number;       // Bonus des upgrades
  finalRate: number;          // Gain final par minute
}

export function calculateVoiceEarnings(
  sessionMinutes: number,
  othersCount: number,
  upgradeBonus: number = 0
): VoiceEarningsInfo {
  const baseRate = 0.05;
  const othersBonus = 0.02 * Math.max(0, othersCount - 1);
  const sessionMultiplier = getSessionMultiplier(sessionMinutes);
  const happyHourMultiplier = getHappyHourMultiplier();
  
  const finalRate = (baseRate + othersBonus + upgradeBonus) * sessionMultiplier * happyHourMultiplier;
  
  return {
    baseRate,
    othersBonus,
    sessionMultiplier,
    happyHourMultiplier,
    upgradeBonus,
    finalRate,
  };
}

// Formater la durée en "Xh XXm XXs"
export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m ${seconds.toString().padStart(2, "0")}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  }
  return `${seconds}s`;
}

// Formater les minutes en "Xh XXm"
export function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }
  return `${minutes}m`;
}
