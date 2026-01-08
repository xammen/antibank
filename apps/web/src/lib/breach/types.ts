// Types pour le mini-jeu Breach Protocol

export const BREACH_CODES = ["55", "BD", "1C", "E9", "7A"] as const;
export type BreachCode = (typeof BREACH_CODES)[number];

export interface MatrixCell {
  id: string;
  code: BreachCode;
  row: number;
  col: number;
  isSelected: boolean;
  isSolution: boolean;
}

export type SelectionDirection = "ROW" | "COL";

export interface MatrixSelection {
  direction: SelectionDirection;
  value: number; // row or col index
}

export interface SequenceCode {
  code: BreachCode;
  matched: boolean;
}

export enum SequenceStatus {
  IN_PROGRESS = "IN_PROGRESS",
  SOLVED = "SOLVED",
  FAILED = "FAILED",
}

export interface Sequence {
  id: string;
  codes: SequenceCode[];
  status: SequenceStatus;
  reward: string; // Description de la récompense
}

export enum BreachFinishStatus {
  IN_PROGRESS = "IN_PROGRESS",
  ALL_SEQUENCES_SOLVED = "ALL_SEQUENCES_SOLVED",
  SOME_SEQUENCES_SOLVED = "SOME_SEQUENCES_SOLVED",
  BUFFER_FULL = "BUFFER_FULL",
  TIMED_OUT = "TIMED_OUT",
  FAILED = "FAILED",
}

export interface BreachConfig {
  matrixSize: number;        // 4-6
  bufferSize: number;        // 4-8
  numberOfSequences: number; // 1-3
  minSequenceSize: number;   // 2-3
  maxSequenceSize: number;   // 3-5
  timeLimit: number;         // secondes
}

export interface BreachDifficulty {
  name: string;
  config: BreachConfig;
}

// Difficultés prédéfinies selon le type de braquage
export const BREACH_DIFFICULTIES: Record<string, BreachDifficulty> = {
  easy: {
    name: "facile",
    config: {
      matrixSize: 4,
      bufferSize: 6,
      numberOfSequences: 1,
      minSequenceSize: 2,
      maxSequenceSize: 3,
      timeLimit: 45,
    },
  },
  medium: {
    name: "moyen",
    config: {
      matrixSize: 5,
      bufferSize: 5,
      numberOfSequences: 2,
      minSequenceSize: 2,
      maxSequenceSize: 4,
      timeLimit: 40,
    },
  },
  hard: {
    name: "difficile",
    config: {
      matrixSize: 5,
      bufferSize: 5,
      numberOfSequences: 3,
      minSequenceSize: 3,
      maxSequenceSize: 4,
      timeLimit: 35,
    },
  },
  antibank: {
    name: "antibank",
    config: {
      matrixSize: 6,
      bufferSize: 4,
      numberOfSequences: 3,
      minSequenceSize: 3,
      maxSequenceSize: 5,
      timeLimit: 30,
    },
  },
};

export interface BreachResult {
  success: boolean;
  sequencesSolved: number;
  totalSequences: number;
  timeRemaining: number;
  finishStatus: BreachFinishStatus;
}

// Calcul du multiplicateur de butin selon les séquences réussies
export function calculateLootMultiplier(solved: number, total: number): number {
  if (solved === 0) return 0;
  if (solved === total) return 1.1; // Bonus 10% pour perfection
  return 0.4 + (solved / total) * 0.35; // 40% à 75%
}
