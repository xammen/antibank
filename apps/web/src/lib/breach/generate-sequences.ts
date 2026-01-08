// Génération des séquences à partir du chemin solution

import {
  type BreachCode,
  type BreachConfig,
  type MatrixCell,
  type Sequence,
  type SequenceCode,
  SequenceStatus,
} from "./types";

function generateId(): string {
  return Math.random().toString(36).slice(2, 8);
}

// Simple PRNG
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
  };
}

const SEQUENCE_REWARDS = [
  "acces au coffre",
  "desactivation alarme",
  "bonus butin +25%",
  "effacement traces",
  "acces compte principal",
  "bypass securite",
];

export function generateSequences(
  solution: MatrixCell[],
  config: BreachConfig,
  seed?: number
): Sequence[] {
  const prng = createPRNG(seed ?? Date.now());
  const { numberOfSequences, minSequenceSize, maxSequenceSize } = config;

  // Extraire les codes de la solution
  const solutionCodes = solution.map((cell) => cell.code);

  // Générer toutes les sous-séquences possibles
  const possibleSequences: BreachCode[][] = [];

  for (let start = 0; start < solutionCodes.length; start++) {
    for (let len = minSequenceSize; len <= maxSequenceSize; len++) {
      if (start + len <= solutionCodes.length) {
        possibleSequences.push(solutionCodes.slice(start, start + len));
      }
    }
  }

  // Mélanger et sélectionner les séquences
  // Éviter les séquences qui commencent par le même code (ambiguïté)
  const selectedSequences: BreachCode[][] = [];
  const usedStartCodes = new Set<BreachCode>();

  // Mélanger les possibilités
  for (let i = possibleSequences.length - 1; i > 0; i--) {
    const j = prng.randomInt(0, i);
    [possibleSequences[i], possibleSequences[j]] = [
      possibleSequences[j],
      possibleSequences[i],
    ];
  }

  for (const seq of possibleSequences) {
    if (selectedSequences.length >= numberOfSequences) break;

    // Éviter les séquences avec le même code de départ
    if (!usedStartCodes.has(seq[0])) {
      selectedSequences.push(seq);
      usedStartCodes.add(seq[0]);
    }
  }

  // Si on n'a pas assez de séquences uniques, en ajouter quand même
  if (selectedSequences.length < numberOfSequences) {
    for (const seq of possibleSequences) {
      if (selectedSequences.length >= numberOfSequences) break;
      if (!selectedSequences.includes(seq)) {
        selectedSequences.push(seq);
      }
    }
  }

  // Convertir en objets Sequence
  const sequences: Sequence[] = selectedSequences.map((codes, index) => ({
    id: `seq-${generateId()}`,
    codes: codes.map((code) => ({
      code,
      matched: false,
    })),
    status: SequenceStatus.IN_PROGRESS,
    reward: SEQUENCE_REWARDS[index % SEQUENCE_REWARDS.length],
  }));

  return sequences;
}

// Valide les séquences par rapport au buffer actuel
export function validateSequences(
  sequences: Sequence[],
  buffer: BreachCode[]
): Sequence[] {
  return sequences.map((sequence) => {
    if (sequence.status !== SequenceStatus.IN_PROGRESS) {
      return sequence;
    }

    let seqIdx = 0;
    const matchedCodes: boolean[] = new Array(sequence.codes.length).fill(false);

    for (const bufCode of buffer) {
      if (bufCode === sequence.codes[seqIdx].code) {
        matchedCodes[seqIdx] = true;
        seqIdx++;

        if (seqIdx === sequence.codes.length) {
          // Séquence complète!
          return {
            ...sequence,
            codes: sequence.codes.map((c, i) => ({
              ...c,
              matched: matchedCodes[i],
            })),
            status: SequenceStatus.SOLVED,
          };
        }
      } else if (seqIdx > 0) {
        // Reset si le code ne correspond pas après avoir commencé
        seqIdx = 0;
        matchedCodes.fill(false);
        
        // Vérifier si ce code correspond au début
        if (bufCode === sequence.codes[0].code) {
          matchedCodes[0] = true;
          seqIdx = 1;
        }
      }
    }

    return {
      ...sequence,
      codes: sequence.codes.map((c, i) => ({
        ...c,
        matched: matchedCodes[i],
      })),
    };
  });
}

// Calcule l'offset visuel pour l'animation de slide
export function calculateSequenceOffset(
  sequence: Sequence,
  buffer: BreachCode[]
): number {
  if (sequence.status === SequenceStatus.SOLVED) {
    return 0;
  }

  let offset = 0;
  let seqIdx = 0;

  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === sequence.codes[seqIdx]?.code) {
      if (seqIdx === 0) {
        offset = i;
      }
      seqIdx++;
    } else if (seqIdx > 0) {
      seqIdx = 0;
      if (buffer[i] === sequence.codes[0]?.code) {
        offset = i;
        seqIdx = 1;
      }
    }
  }

  return offset;
}
