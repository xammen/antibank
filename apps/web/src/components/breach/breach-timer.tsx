"use client";

import { useBreachStore } from "./use-breach-store";

export function BreachTimer() {
  const { timeRemaining, config, isStarted, isFinished } = useBreachStore();

  const percentage = (timeRemaining / config.timeLimit) * 100;
  const isLow = timeRemaining <= 10;
  const isCritical = timeRemaining <= 5;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] uppercase tracking-widest text-[var(--text-muted)]">
          temps
        </span>
        <span className={`
          font-mono text-lg tabular-nums transition-colors
          ${isCritical
            ? "text-red-500 animate-pulse"
            : isLow
              ? "text-yellow-400"
              : "text-[var(--text)]"
          }
        `}>
          {formatTime(timeRemaining)}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full bg-[var(--line)]/30 overflow-hidden">
        <div
          className={`
            h-full transition-all duration-1000 ease-linear
            ${isCritical
              ? "bg-red-500"
              : isLow
                ? "bg-yellow-400"
                : "bg-green-500"
            }
          `}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Status text */}
      {!isStarted && !isFinished && (
        <span className="text-[0.6rem] text-[var(--text-muted)] text-center">
          cliquer pour commencer
        </span>
      )}
    </div>
  );
}
