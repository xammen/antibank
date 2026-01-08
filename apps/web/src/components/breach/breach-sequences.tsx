"use client";

import { useBreachStore } from "./use-breach-store";
import { SequenceStatus, type Sequence, type SequenceCode } from "@/lib/breach";

export function BreachSequences() {
  const { sequences, isFinished } = useBreachStore();

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[0.65rem] uppercase tracking-widest text-[var(--text-muted)]">
        sequences
      </span>
      
      <div className="flex flex-col gap-2">
        {sequences.map((sequence: Sequence) => (
          <SequenceRow key={sequence.id} sequence={sequence} />
        ))}
      </div>
    </div>
  );
}

function SequenceRow({ sequence }: { sequence: Sequence }) {
  const isSolved = sequence.status === SequenceStatus.SOLVED;
  const isFailed = sequence.status === SequenceStatus.FAILED;

  return (
    <div className={`
      flex items-center gap-3 p-2 border transition-all duration-300
      ${isSolved
        ? "border-green-500/50 bg-green-500/10"
        : isFailed
          ? "border-red-500/30 bg-red-500/5 opacity-50"
          : "border-[var(--line)]/30 bg-transparent"
      }
    `}>
      {/* Status indicator */}
      <div className={`
        w-2 h-2 rounded-full transition-all
        ${isSolved
          ? "bg-green-500"
          : isFailed
            ? "bg-red-500"
            : "bg-[var(--text-muted)]"
        }
      `} />

      {/* Codes */}
      <div className="flex gap-1">
        {sequence.codes.map((code: SequenceCode, idx: number) => (
          <div
            key={idx}
            className={`
              w-8 h-8 font-mono text-xs font-bold uppercase
              border flex items-center justify-center
              transition-all duration-150
              ${code.matched
                ? "bg-green-500/30 border-green-500 text-green-400"
                : isFailed
                  ? "border-red-500/30 text-red-400/50"
                  : "border-[var(--line)]/50 text-[var(--text)]"
              }
            `}
          >
            {code.code}
          </div>
        ))}
      </div>

      {/* Reward */}
      <span className={`
        text-[0.65rem] ml-auto
        ${isSolved
          ? "text-green-400"
          : isFailed
            ? "text-red-400/50 line-through"
            : "text-[var(--text-muted)]"
        }
      `}>
        {sequence.reward}
      </span>

      {/* Status text */}
      {isSolved && (
        <span className="text-[0.6rem] uppercase tracking-wider text-green-400 px-1.5 py-0.5 border border-green-500/50">
          ok
        </span>
      )}
      {isFailed && (
        <span className="text-[0.6rem] uppercase tracking-wider text-red-400/50 px-1.5 py-0.5 border border-red-500/30">
          fail
        </span>
      )}
    </div>
  );
}
