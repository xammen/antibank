// Pierre-Feuille-Ciseaux - Logic
// Règles:
// - Best of 1
// - Mise identique des deux côtés
// - Gagnant prend 95% du pot (5% taxe maison)
// - Anti-spam: si 3 duels en 10 min entre mêmes joueurs, gains réduits de 50%

export type PFCChoice = "pierre" | "feuille" | "ciseaux";

const HOUSE_EDGE = 0.05;

/**
 * Détermine le gagnant
 */
export function determinePFCWinner(
  player1Choice: PFCChoice,
  player2Choice: PFCChoice
): "player1" | "player2" | "tie" {
  if (player1Choice === player2Choice) return "tie";

  const wins: Record<PFCChoice, PFCChoice> = {
    pierre: "ciseaux",
    feuille: "pierre",
    ciseaux: "feuille",
  };

  if (wins[player1Choice] === player2Choice) return "player1";
  return "player2";
}

/**
 * Calcule les gains
 */
export function calculatePFCWinnings(
  bet: number,
  result: "player1" | "player2" | "tie",
  isPlayer1: boolean,
  penaltyMultiplier: number = 1
): number {
  if (result === "tie") {
    // Remboursement moins les frais
    const fee = bet * HOUSE_EDGE;
    return bet - fee;
  }

  const isWinner =
    (result === "player1" && isPlayer1) ||
    (result === "player2" && !isPlayer1);

  if (isWinner) {
    const pot = bet * 2;
    const fee = pot * HOUSE_EDGE;
    const winnings = pot - fee;
    return winnings * penaltyMultiplier;
  }

  return 0;
}

/**
 * Emoji pour chaque choix
 */
export function getPFCEmoji(choice: PFCChoice): string {
  const emojis: Record<PFCChoice, string> = {
    pierre: "🪨",
    feuille: "📄",
    ciseaux: "✂️",
  };
  return emojis[choice];
}

/**
 * Vérifie si les joueurs ont joué trop souvent ensemble (anti-spam)
 */
export function calculatePenalty(recentGamesCount: number): number {
  // Si 3+ jeux en 10 min, gains réduits de 50%
  if (recentGamesCount >= 3) return 0.5;
  return 1;
}

export const PFC_CONFIG = {
  CHALLENGE_EXPIRY_MS: 5 * 60 * 1000, // 5 minutes
  CHOICE_TIMEOUT_MS: 30 * 1000, // 30 secondes pour choisir
  ANTI_SPAM_WINDOW_MS: 10 * 60 * 1000, // 10 minutes
  ANTI_SPAM_THRESHOLD: 3, // 3 jeux
  MIN_BET: 0.5,
};
