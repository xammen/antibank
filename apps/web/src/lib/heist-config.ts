// ============================================
// HEIST CONSTANTS
// ============================================

export const HEIST_CONFIG = {
  // Stage 1: Reconnaissance
  VOICE_MINUTES_REQUIRED: 60,
  CRASH_GAMES_REQUIRED: 10,
  
  // Stage 2: Financement
  BALANCE_REQUIRED: 50,
  ROBBERIES_REQUIRED: 3,
  
  // Stage 3: Équipement
  REQUIRED_ITEMS: ["pied_de_biche", "kit_crochetage"],
  OPTIONAL_ITEMS: {
    gilet_pare_balles: { chanceBonus: 10 },
    vpn: { failLossReduction: 20 }, // 60% -> 40%
  },
  
  // Stage 4: Boosters (reset après chaque tentative)
  FAST_CLICKS_REQUIRED: 5000,
  FAST_CLICKS_TIME_LIMIT: 20 * 60 * 1000, // 20 minutes en ms
  WIN_STREAK_REQUIRED: 5,
  BOOSTER_EXPIRY: 24 * 60 * 60 * 1000, // 24h en ms
  
  // Stage 5: Lancement
  VOICE_OTHERS_REQUIRED: 2,
  ENTRY_FEE: 100,
  
  // Stats de base (après quête complétée)
  BASE_SUCCESS_CHANCE: 30,
  BASE_TREASURY_STEAL: 8,
  BASE_FAIL_LOSS: 60,
  COOLDOWN_HOURS: 6,
  
  // Bonus
  GILET_CHANCE_BONUS: 10,
  VPN_LOSS_REDUCTION: 20, // 60% -> 40%
  FAST_CLICKS_LOOT_BONUS: 5,
  WIN_STREAK_LOOT_BONUS: 5,
  SURVIVED_CHANCE_BONUS: 5,
};
