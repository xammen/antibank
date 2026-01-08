// Génération de la matrice et du chemin solution pour Breach Protocol

import {
  BREACH_CODES,
  type BreachCode,
  type BreachConfig,
  type MatrixCell,
  type SelectionDirection,
} from "./types";

// Simple PRNG pour génération déterministe
function createPRNG(seed: number) {
  const A = 1103515245;
  const C = 12345;
  const M = 2 ** 31;
  let state = seed;

  return {
    next(): number {
      state = (A * state + C) % M;
      return state / M;
    },
    randomInt(min: number, max: number): number {
      return Math.floor(this.next() * (max - min + 1)) + min;
    },
    randomElement<T>(arr: T[]): T {
      return arr[this.randomInt(0, arr.length - 1)];
    },
    shuffle<T>(arr: T[]): T[] {
      const result = [...arr];
      for (let i = result.length - 1; i > 0; i--) {
        const j = this.randomInt(0, i);
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result;
    },
  };
}

function swapDirection(dir: SelectionDirection): SelectionDirection {
  return dir === "ROW" ? "COL" : "ROW";
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export interface MatrixGenerationResult {
  matrix: MatrixCell[];
  solution: MatrixCell[];
  size: number;
}

export function generateMatrix(
  config: BreachConfig,
  seed?: number
): MatrixGenerationResult {
  const prng = createPRNG(seed ?? Date.now());
  const { matrixSize } = config;
  
  // Calculer la taille du chemin solution
  // Doit être assez long pour contenir toutes les séquences
  const solutionSize = Math.min(
    config.bufferSize,
    config.maxSequenceSize * config.numberOfSequences - (config.numberOfSequences - 1)
  );

  // 1. Créer la matrice initiale avec des codes aléatoires
  const matrix: MatrixCell[] = [];
  for (let row = 0; row < matrixSize; row++) {
    for (let col = 0; col < matrixSize; col++) {
      matrix.push({
        id: `${row}-${col}-${generateId()}`,
        code: prng.randomElement([...BREACH_CODES]),
        row,
        col,
        isSelected: false,
        isSolution: false,
      });
    }
  }

  // 2. Générer un chemin solution valide avec backtracking
  const solution: MatrixCell[] = [];
  const currentPath: { row: number; col: number }[] = [];
  const blockedIndices: Set<string>[] = [];
  
  let direction: SelectionDirection = "ROW";
  let currentValue = 0; // Commence sur la première ligne
  let backtrackedAmt = 0;
  const maxBacktracks = 1000;

  while (currentPath.length < solutionSize && backtrackedAmt < maxBacktracks) {
    // Trouver les cellules disponibles
    const availableCells: { row: number; col: number; idx: number }[] = [];
    
    for (let i = 0; i < matrixSize; i++) {
      const row = direction === "ROW" ? currentValue : i;
      const col = direction === "COL" ? currentValue : i;
      const idx = row * matrixSize + col;
      
      // Vérifier si cette cellule est déjà dans le chemin ou bloquée
      const isInPath = currentPath.some((p) => p.row === row && p.col === col);
      const isBlocked = blockedIndices[currentPath.length]?.has(`${row}-${col}`);
      
      if (!isInPath && !isBlocked) {
        availableCells.push({ row, col, idx });
      }
    }

    if (availableCells.length > 0) {
      // Choisir une cellule aléatoire
      const chosen = prng.randomElement(availableCells);
      currentPath.push({ row: chosen.row, col: chosen.col });
      
      // Préparer pour la prochaine itération
      currentValue = direction === "ROW" ? chosen.col : chosen.row;
      direction = swapDirection(direction);
      
      // Initialiser le set de blocage pour cette position
      if (!blockedIndices[currentPath.length]) {
        blockedIndices[currentPath.length] = new Set();
      }
    } else {
      // Backtrack
      if (currentPath.length === 0) {
        // Impossible de trouver un chemin, reset
        blockedIndices.length = 0;
        direction = "ROW";
        currentValue = prng.randomInt(0, matrixSize - 1);
        backtrackedAmt++;
        continue;
      }

      const lastPos = currentPath.pop()!;
      
      // Bloquer cette position pour éviter de la reprendre
      if (!blockedIndices[currentPath.length]) {
        blockedIndices[currentPath.length] = new Set();
      }
      blockedIndices[currentPath.length].add(`${lastPos.row}-${lastPos.col}`);
      
      // Restaurer la direction et la valeur
      direction = swapDirection(direction);
      if (currentPath.length > 0) {
        const prevPos = currentPath[currentPath.length - 1];
        currentValue = direction === "ROW" ? prevPos.row : prevPos.col;
      } else {
        currentValue = 0;
        direction = "ROW";
      }
      
      backtrackedAmt++;
    }
  }

  // 3. Assigner des codes aux cellules du chemin solution
  // et mettre à jour la matrice
  for (const pos of currentPath) {
    const idx = pos.row * matrixSize + pos.col;
    const cell = matrix[idx];
    cell.isSolution = true;
    cell.code = prng.randomElement([...BREACH_CODES]);
    solution.push(cell);
  }

  return {
    matrix,
    solution,
    size: matrixSize,
  };
}

// Vérifie si une cellule peut être sélectionnée
export function isCellSelectable(
  cell: MatrixCell,
  selection: { direction: SelectionDirection; value: number }
): boolean {
  if (selection.direction === "ROW") {
    return cell.row === selection.value;
  }
  return cell.col === selection.value;
}
