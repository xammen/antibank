"use client";

import { useBreachStore } from "./use-breach-store";
import type { MatrixCell } from "@/lib/breach";

export function BreachBuffer() {
  const { buffer, config, hoveredCell, isFinished } = useBreachStore();

  const slots = Array.from({ length: config.bufferSize }, (_, i) => {
    const cell = buffer[i] as MatrixCell | undefined;
    const isHoveredSlot = !cell && i === buffer.length && hoveredCell && !isFinished;

    return (
      <div
        key={i}
        className={`
          w-10 h-10 font-mono text-sm font-bold uppercase
          border flex items-center justify-center
          transition-all duration-150
          ${cell
            ? "bg-green-500/20 border-green-500 text-green-400"
            : isHoveredSlot
              ? "bg-green-500/10 border-green-500/50 text-green-400/50"
              : "bg-transparent border-[var(--line)]/30 text-[var(--text-muted)]"
          }
        `}
      >
        {cell?.code || (isHoveredSlot ? hoveredCell?.code : "")}
      </div>
    );
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] uppercase tracking-widest text-[var(--text-muted)]">
          buffer
        </span>
        <span className="text-[0.65rem] text-[var(--text-muted)] font-mono">
          {buffer.length}/{config.bufferSize}
        </span>
      </div>
      <div className="flex gap-1">
        {slots}
      </div>
    </div>
  );
}
