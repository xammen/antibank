// Crash Game Logic
// Distribution des crashes selon les specs:
// - 50% avant x2
// - 80% avant x5
// - 95% avant x10
// - 5% peuvent aller jusqu'à x50

const HOUSE_EDGE = 0.05; // 5% pour la maison

/**
 * Génère un point de crash aléatoire avec la distribution correcte
 * Utilise une distribution exponentielle inversée
 */
export function generateCrashPoint(): number {
  // Formule: crashPoint = 1 / (1 - random * (1 - houseEdge))
  // Cela donne une distribution où la maison gagne sur le long terme
  const random = Math.random();
  const e = 1 - HOUSE_EDGE;
  
  // Évite la division par zéro et les valeurs extrêmes
  const safeRandom = Math.min(random, 0.99);
  
  let crashPoint = e / (1 - safeRandom);
  
  // Cap à x50 max
  crashPoint = Math.min(crashPoint, 50);
  
  // Minimum x1.01 (sinon crash instantané car ln(1) = 0)
  crashPoint = Math.max(crashPoint, 1.01);
  
  return Math.floor(crashPoint * 100) / 100;
}

/**
 * Calcule le multiplicateur actuel basé sur le temps écoulé
 * Le multiplicateur augmente de façon exponentielle
 */
export function calculateMultiplier(elapsedMs: number): number {
  // Croissance exponentielle: commence lent, accélère
  // x2 en ~5 secondes, x5 en ~10 secondes, x10 en ~15 secondes
  const growthRate = 0.00006; // Ajusté pour une bonne vitesse
  const multiplier = Math.pow(Math.E, growthRate * elapsedMs);
  return Math.floor(multiplier * 100) / 100;
}

/**
 * Calcule le temps nécessaire pour atteindre un multiplicateur donné
 */
export function timeToMultiplier(targetMultiplier: number): number {
  const growthRate = 0.00006;
  return Math.log(targetMultiplier) / growthRate;
}

/**
 * Valide une mise
 */
export function validateBet(amount: number, balance: number): { valid: boolean; error?: string } {
  const MIN_BET = 0.5;
  const MAX_BET = 10000;

  if (amount < MIN_BET) {
    return { valid: false, error: `mise minimum: ${MIN_BET}€` };
  }

  if (amount > MAX_BET) {
    return { valid: false, error: `mise maximum: ${MAX_BET}€` };
  }

  if (amount > balance) {
    return { valid: false, error: "solde insuffisant" };
  }

  return { valid: true };
}

/**
 * Calcule le gain avec la taxe maison
 */
export function calculateWinnings(bet: number, multiplier: number): number {
  const grossWin = bet * multiplier;
  const tax = (grossWin - bet) * HOUSE_EDGE;
  return Math.floor((grossWin - tax) * 100) / 100;
}

/**
 * Génère les points du graphique pour l'animation
 */
export function generateGraphPoints(
  currentMultiplier: number,
  pointCount: number = 100
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  
  for (let i = 0; i <= pointCount; i++) {
    const progress = i / pointCount;
    const time = timeToMultiplier(currentMultiplier) * progress;
    const mult = calculateMultiplier(time);
    
    points.push({
      x: progress * 100,
      y: Math.min(mult, currentMultiplier),
    });
  }
  
  return points;
}

// États du jeu
export type CrashGameState = "waiting" | "starting" | "running" | "crashed";

export interface CrashGameData {
  id: string;
  state: CrashGameState;
  crashPoint?: number; // Seulement visible après crash
  currentMultiplier: number;
  startTime?: number;
  players: CrashPlayer[];
  countdown?: number; // Secondes avant démarrage
}

export interface CrashPlayer {
  odrzerId: string;
  odrzerame: string;
  bet: number;
  cashedOut: boolean;
  cashOutMultiplier?: number;
  profit?: number;
}

// Timing constants
export const CRASH_CONFIG = {
  COUNTDOWN_SECONDS: 10,      // Temps d'attente entre les parties
  MIN_GAME_DURATION_MS: 1000, // Minimum 1 seconde de jeu
  TICK_RATE_MS: 50,          // Update toutes les 50ms (20 fps pour la logique)
  GRAPH_FPS: 60,             // 60 fps pour le graphique
};
