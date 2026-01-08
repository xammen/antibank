"use client";

import { create } from "zustand";
import {
  type BreachConfig,
  type BreachResult,
  BreachFinishStatus,
  type MatrixCell,
  type Sequence,
  SequenceStatus,
  type SelectionDirection,
  BREACH_DIFFICULTIES,
} from "@/lib/breach";
import { generateMatrix } from "@/lib/breach/generate-matrix";
import { generateSequences, validateSequences } from "@/lib/breach/generate-sequences";

interface BreachState {
  // Config
  config: BreachConfig;
  difficulty: string;

  // Game state
  isStarted: boolean;
  isFinished: boolean;
  finishStatus: BreachFinishStatus;

  // Matrix
  matrix: MatrixCell[];
  matrixSize: number;
  selection: {
    direction: SelectionDirection;
    value: number;
  };

  // Buffer
  buffer: MatrixCell[];
  hoveredCell: MatrixCell | null;

  // Sequences
  sequences: Sequence[];

  // Timer
  timeRemaining: number;
  timerInterval: ReturnType<typeof setInterval> | null;

  // Actions
  initGame: (difficulty?: string, seed?: number) => void;
  startGame: () => void;
  selectCell: (cell: MatrixCell) => void;
  setHoveredCell: (cell: MatrixCell | null) => void;
  tick: () => void;
  finishGame: (status: BreachFinishStatus) => void;
  getResult: () => BreachResult;
  reset: () => void;
}

export const useBreachStore = create<BreachState>()((set, get) => ({
  // Initial state
  config: BREACH_DIFFICULTIES.medium.config,
  difficulty: "medium",

  isStarted: false,
  isFinished: false,
  finishStatus: BreachFinishStatus.IN_PROGRESS,

  matrix: [],
  matrixSize: 5,
  selection: {
    direction: "ROW",
    value: 0,
  },

  buffer: [],
  hoveredCell: null,

  sequences: [],

  timeRemaining: 40,
  timerInterval: null,

  // Actions
  initGame: (difficulty = "medium", seed?: number) => {
    const { timerInterval } = get();
    if (timerInterval) {
      clearInterval(timerInterval);
    }

    const diffConfig = BREACH_DIFFICULTIES[difficulty] || BREACH_DIFFICULTIES.medium;
    const config = diffConfig.config;
    const actualSeed = seed ?? Date.now();

    // Générer la matrice et la solution
    const { matrix, solution, size } = generateMatrix(config, actualSeed);

    // Générer les séquences à partir de la solution
    const sequences = generateSequences(solution, config, actualSeed + 1);

    set({
      config,
      difficulty,
      isStarted: false,
      isFinished: false,
      finishStatus: BreachFinishStatus.IN_PROGRESS,
      matrix,
      matrixSize: size,
      selection: {
        direction: "ROW",
        value: 0,
      },
      buffer: [],
      hoveredCell: null,
      sequences,
      timeRemaining: config.timeLimit,
      timerInterval: null,
    });
  },

  startGame: () => {
    const { isStarted } = get();
    if (isStarted) return;

    const interval = setInterval(() => {
      get().tick();
    }, 1000);

    set({
      isStarted: true,
      timerInterval: interval,
    });
  },

  selectCell: (cell: MatrixCell) => {
    const state = get();
    const { isStarted, isFinished, selection, buffer, config, matrix, sequences } = state;

    // Démarrer le jeu au premier clic
    if (!isStarted && !isFinished) {
      get().startGame();
    }

    if (isFinished) return;

    // Vérifier si la cellule est sélectionnable
    const isSelectable =
      selection.direction === "ROW"
        ? cell.row === selection.value
        : cell.col === selection.value;

    if (!isSelectable) return;

    // Vérifier si déjà sélectionnée
    if (buffer.some((b: MatrixCell) => b.id === cell.id)) return;

    // Ajouter au buffer
    const newBuffer = [...buffer, cell];

    // Mettre à jour la matrice
    const newMatrix = matrix.map((c: MatrixCell) =>
      c.id === cell.id ? { ...c, isSelected: true } : c
    );

    // Changer la direction et la valeur de sélection
    const newDirection: SelectionDirection =
      selection.direction === "ROW" ? "COL" : "ROW";
    const newValue =
      selection.direction === "ROW" ? cell.col : cell.row;

    // Valider les séquences
    const bufferCodes = newBuffer.map((c: MatrixCell) => c.code);
    const newSequences = validateSequences(sequences, bufferCodes);

    set({
      buffer: newBuffer,
      matrix: newMatrix,
      selection: {
        direction: newDirection,
        value: newValue,
      },
      sequences: newSequences,
    });

    // Vérifier les conditions de fin
    const allSolved = newSequences.every(
      (s: Sequence) => s.status === SequenceStatus.SOLVED
    );
    const bufferFull = newBuffer.length >= config.bufferSize;

    if (allSolved) {
      get().finishGame(BreachFinishStatus.ALL_SEQUENCES_SOLVED);
    } else if (bufferFull) {
      const someSolved = newSequences.some(
        (s: Sequence) => s.status === SequenceStatus.SOLVED
      );
      if (someSolved) {
        get().finishGame(BreachFinishStatus.SOME_SEQUENCES_SOLVED);
      } else {
        get().finishGame(BreachFinishStatus.BUFFER_FULL);
      }
    }
  },

  setHoveredCell: (cell: MatrixCell | null) => {
    set({ hoveredCell: cell });
  },

  tick: () => {
    const { timeRemaining, isFinished, sequences } = get();

    if (isFinished) return;

    const newTime = timeRemaining - 1;

    if (newTime <= 0) {
      const someSolved = sequences.some(
        (s: Sequence) => s.status === SequenceStatus.SOLVED
      );
      if (someSolved) {
        get().finishGame(BreachFinishStatus.SOME_SEQUENCES_SOLVED);
      } else {
        get().finishGame(BreachFinishStatus.TIMED_OUT);
      }
    } else {
      set({ timeRemaining: newTime });
    }
  },

  finishGame: (status: BreachFinishStatus) => {
    const { timerInterval, sequences } = get();

    if (timerInterval) {
      clearInterval(timerInterval);
    }

    // Marquer les séquences non résolues comme échouées
    const finalSequences = sequences.map((s: Sequence) =>
      s.status === SequenceStatus.IN_PROGRESS
        ? { ...s, status: SequenceStatus.FAILED }
        : s
    );

    set({
      isFinished: true,
      finishStatus: status,
      timerInterval: null,
      sequences: finalSequences,
    });
  },

  getResult: (): BreachResult => {
    const { sequences, timeRemaining, finishStatus } = get();

    const solved = sequences.filter(
      (s: Sequence) => s.status === SequenceStatus.SOLVED
    ).length;
    const total = sequences.length;

    return {
      success: solved > 0,
      sequencesSolved: solved,
      totalSequences: total,
      timeRemaining,
      finishStatus,
    };
  },

  reset: () => {
    const { timerInterval, difficulty } = get();
    if (timerInterval) {
      clearInterval(timerInterval);
    }
    get().initGame(difficulty);
  },
}));
