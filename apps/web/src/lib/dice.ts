// Duel de Dés - Logic
// Règles:
// - Les deux joueurs misent la même somme
// - Chacun lance 2d6 (2 dés à 6 faces)
// - Le plus haut total gagne tout le pot
// - Égalité = remboursement moins 5% de frais
// - Mise max : (plus petit solde des deux joueurs) / 2

const HOUSE_EDGE = 0.05; // 5% sur les égalités

/**
 * Lance 2d6 (2 dés à 6 faces)
 */
export function rollDice(): number {
  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;
  return die1 + die2;
}

/**
 * Détermine le gagnant d'un duel
 */
export function determineWinner(
  player1Roll: number,
  player2Roll: number
): "player1" | "player2" | "tie" {
  if (player1Roll > player2Roll) return "player1";
  if (player2Roll > player1Roll) return "player2";
  return "tie";
}

/**
 * Calcule les gains
 */
export function calculateDiceWinnings(
  bet: number,
  result: "player1" | "player2" | "tie",
  isPlayer1: boolean
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
    // Gagne le pot moins les frais (pot = 2 * bet)
    const pot = bet * 2;
    const fee = pot * HOUSE_EDGE;
    return pot - fee;
  }

  // Perdant
  return 0;
}

/**
 * Valide une mise pour un duel
 */
export function validateDiceBet(
  amount: number,
  player1Balance: number,
  player2Balance: number
): { valid: boolean; error?: string } {
  const MIN_BET = 0.5;

  if (amount < MIN_BET) {
    return { valid: false, error: `mise minimum: ${MIN_BET}€` };
  }

  // Max = plus petit solde / 2
  const maxBet = Math.min(player1Balance, player2Balance) / 2;
  if (amount > maxBet) {
    return { valid: false, error: `mise maximum: ${maxBet.toFixed(2)}€` };
  }

  if (amount > player1Balance || amount > player2Balance) {
    return { valid: false, error: "solde insuffisant" };
  }

  return { valid: true };
}

// Animation des dés
export function getDiceEmoji(value: number): string {
  const diceEmojis = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
  return diceEmojis[value] || "🎲";
}

export function splitRollIntoDice(roll: number): [number, number] {
  // Retourne deux valeurs possibles qui donnent le total
  // (simplifié - en vrai on devrait stocker les deux dés séparément)
  const die1 = Math.min(6, Math.max(1, Math.ceil(roll / 2)));
  const die2 = roll - die1;
  return [die1, die2];
}

export const DICE_CONFIG = {
  CHALLENGE_EXPIRY_MS: 5 * 60 * 1000, // 5 minutes pour accepter
  MIN_BET: 0.5,
};
