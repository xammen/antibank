// Crash Game Logic
// Distribution des crashes selon les specs:
// - 50% avant x2
// - 80% avant x5
// - 95% avant x10
// - 5% peuvent aller jusqu'à x50
//
// EVENT SPECIAL: Tous les 5 crashs, 30% de chance de "Big Multiplier" (x5-x25)

const HOUSE_EDGE = 0.05; // 5% pour la maison

/**
 * Génère un point de crash aléatoire avec la distribution correcte
 * Utilise une distribution exponentielle inversée
 * @param isBigMultiplierRound - Si true, génère un multiplicateur entre x5 et x25
 * 
 * Distribution visée:
 * - ~50% avant x2
 * - ~80% avant x5
 * - ~95% avant x10
 * - ~5% peuvent aller jusqu'à x50
 */
export function generateCrashPoint(isBigMultiplierRound: boolean = false): number {
  // Event Big Multiplier: garantit un crash entre x5 et x25
  if (isBigMultiplierRound) {
    // Distribution uniforme entre 5 et 25
    const bigMultiplier = 5 + Math.random() * 20;
    return Math.floor(bigMultiplier * 100) / 100;
  }

  // Nouvelle formule qui génère naturellement des valeurs >= 1.01
  // Basée sur: crashPoint = 0.99 / (1 - random) avec clamp pour éviter les extrêmes
  // 
  // Cette formule donne une distribution où:
  // - random=0 → 0.99/1 = 0.99 (mais on cap à 1.01 min)
  // - random=0.5 → 0.99/0.5 = 1.98
  // - random=0.8 → 0.99/0.2 = 4.95
  // - random=0.95 → 0.99/0.05 = 19.8
  // - random=0.99 → 0.99/0.01 = 99 (cap à 50)
  
  const random = Math.random();
  const e = 1 - HOUSE_EDGE; // 0.95
  
  // Transformer random pour éviter les crashes trop bas
  // Avec minRandom=0.15: ~8% <= 1.20, ~44% < 2, ~78% < 5
  // Bien plus équilibré que l'ancienne formule (21% <= 1.20)
  const adjusted = 0.15 + random * 0.84; // random entre 0.15 et 0.99
  
  let crashPoint = e / (1 - adjusted);
  
  // Cap à x50 max
  crashPoint = Math.min(crashPoint, 50);
  
  // Minimum absolu x1.01 (crash instantané évité)
  crashPoint = Math.max(crashPoint, 1.01);
  
  return Math.floor(crashPoint * 100) / 100;
}

/**
 * Détermine si le prochain round est un "Big Multiplier" event
 * @param gameNumber - Le numéro du jeu (1, 2, 3, etc.)
 * @returns true si c'est un round Big Multiplier
 */
export function isBigMultiplierEvent(gameNumber: number): boolean {
  // Tous les 5 jeux, 30% de chance
  if (gameNumber % 5 === 0) {
    return Math.random() < 0.30;
  }
  return false;
}

/**
 * Calcule le multiplicateur actuel basé sur le temps écoulé
 * Le multiplicateur augmente de façon exponentielle
 */
export function calculateMultiplier(elapsedMs: number): number {
  // Toujours commencer à 1.00 minimum
  if (elapsedMs <= 0) return 1.00;
  
  // Croissance exponentielle: commence lent, accélère
  // x2 en ~5 secondes, x5 en ~10 secondes, x10 en ~15 secondes
  const growthRate = 0.00006; // Ajusté pour une bonne vitesse
  const multiplier = Math.pow(Math.E, growthRate * elapsedMs);
  return Math.max(1.00, Math.floor(multiplier * 100) / 100);
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
  COUNTDOWN_SECONDS: 15,      // Temps d'attente entre les parties
  MIN_GAME_DURATION_MS: 1000, // Minimum 1 seconde de jeu
  TICK_RATE_MS: 50,          // Update toutes les 50ms (20 fps pour la logique)
  GRAPH_FPS: 60,             // 60 fps pour le graphique
};
