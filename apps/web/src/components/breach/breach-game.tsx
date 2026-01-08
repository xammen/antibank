"use client";

import { useEffect, useCallback } from "react";
import { useBreachStore } from "./use-breach-store";
import { BreachMatrix } from "./breach-matrix";
import { BreachBuffer } from "./breach-buffer";
import { BreachSequences } from "./breach-sequences";
import { BreachTimer } from "./breach-timer";
import { BreachFinishStatus, SequenceStatus, calculateLootMultiplier } from "@/lib/breach";

interface BreachGameProps {
  difficulty?: string;
  targetName?: string;
  potentialLoot?: number;
  onComplete: (result: {
    success: boolean;
    sequencesSolved: number;
    totalSequences: number;
    lootMultiplier: number;
  }) => void;
  onCancel?: () => void;
}

export function BreachGame({
  difficulty = "medium",
  targetName = "CIBLE",
  potentialLoot = 0,
  onComplete,
  onCancel,
}: BreachGameProps) {
  const {
    initGame,
    isFinished,
    finishStatus,
    sequences,
    getResult,
    reset,
  } = useBreachStore();

  // Initialiser le jeu au montage
  useEffect(() => {
    initGame(difficulty);
    
    // Cleanup au démontage
    return () => {
      const { timerInterval } = useBreachStore.getState();
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [difficulty, initGame]);

  // Callback quand le jeu est terminé
  useEffect(() => {
    if (isFinished) {
      const result = getResult();
      const lootMultiplier = calculateLootMultiplier(
        result.sequencesSolved,
        result.totalSequences
      );

      // Petit délai pour laisser voir le résultat
      const timeout = setTimeout(() => {
        onComplete({
          success: result.success,
          sequencesSolved: result.sequencesSolved,
          totalSequences: result.totalSequences,
          lootMultiplier,
        });
      }, 2000);

      return () => clearTimeout(timeout);
    }
  }, [isFinished, getResult, onComplete]);

  const handleRetry = useCallback(() => {
    reset();
  }, [reset]);

  const solved = sequences.filter((s) => s.status === SequenceStatus.SOLVED).length;
  const total = sequences.length;

  // Calculer le butin estimé
  const estimatedLoot = isFinished
    ? potentialLoot * calculateLootMultiplier(solved, total)
    : potentialLoot;

  return (
    <div className="flex flex-col gap-6 p-6 border border-[var(--line)] bg-[rgba(0,0,0,0.8)] max-w-[600px] w-full animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--line)] pb-4">
        <div>
          <h2 className="text-[0.75rem] uppercase tracking-widest text-green-400">
            breach protocol
          </h2>
          <p className="text-[0.65rem] text-[var(--text-muted)] mt-1">
            cible: <span className="text-[var(--text)]">{targetName}</span>
          </p>
        </div>
        {onCancel && !isFinished && (
          <button
            onClick={onCancel}
            className="text-[0.65rem] uppercase tracking-wider text-red-400 hover:text-red-300 transition-colors"
          >
            annuler
          </button>
        )}
      </div>

      {/* Timer */}
      <BreachTimer />

      {/* Main content */}
      <div className="flex gap-6 flex-wrap">
        {/* Matrix */}
        <div className="relative">
          <BreachMatrix />
        </div>

        {/* Right side */}
        <div className="flex flex-col gap-4 flex-1 min-w-[200px]">
          <BreachBuffer />
          <BreachSequences />
        </div>
      </div>

      {/* Loot preview */}
      {potentialLoot > 0 && (
        <div className="flex items-center justify-between p-3 border border-[var(--line)]/30 bg-[var(--line)]/5">
          <span className="text-[0.65rem] uppercase tracking-widest text-[var(--text-muted)]">
            butin estime
          </span>
          <span className={`font-mono ${isFinished ? (solved > 0 ? "text-green-400" : "text-red-400") : "text-[var(--text)]"}`}>
            {estimatedLoot.toFixed(2)}€
          </span>
        </div>
      )}

      {/* Result overlay */}
      {isFinished && (
        <div className={`
          p-4 border text-center
          ${solved === total
            ? "border-green-500 bg-green-500/10"
            : solved > 0
              ? "border-yellow-500 bg-yellow-500/10"
              : "border-red-500 bg-red-500/10"
          }
        `}>
          {solved === total ? (
            <>
              <p className="text-green-400 font-bold uppercase tracking-widest">
                breach reussi
              </p>
              <p className="text-[0.7rem] text-green-400/70 mt-1">
                toutes les sequences completees
              </p>
            </>
          ) : solved > 0 ? (
            <>
              <p className="text-yellow-400 font-bold uppercase tracking-widest">
                breach partiel
              </p>
              <p className="text-[0.7rem] text-yellow-400/70 mt-1">
                {solved}/{total} sequences completees
              </p>
            </>
          ) : (
            <>
              <p className="text-red-400 font-bold uppercase tracking-widest">
                breach echoue
              </p>
              <p className="text-[0.7rem] text-red-400/70 mt-1">
                {finishStatus === BreachFinishStatus.TIMED_OUT
                  ? "temps ecoule"
                  : "buffer plein"
                }
              </p>
            </>
          )}
        </div>
      )}

      {/* Instructions */}
      {!isFinished && (
        <div className="text-[0.6rem] text-[var(--text-muted)] text-center space-y-1">
          <p>selectionne les codes dans l'ordre des sequences</p>
          <p>tu alternes entre lignes et colonnes a chaque selection</p>
        </div>
      )}
    </div>
  );
}
