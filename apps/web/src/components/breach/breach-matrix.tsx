"use client";

import { useBreachStore } from "./use-breach-store";
import type { MatrixCell } from "@/lib/breach";

export function BreachMatrix() {
  const {
    matrix,
    matrixSize,
    selection,
    buffer,
    hoveredCell,
    isFinished,
    selectCell,
    setHoveredCell,
  } = useBreachStore();

  const isCellSelectable = (cell: MatrixCell) => {
    if (isFinished) return false;
    if (buffer.some((b: MatrixCell) => b.id === cell.id)) return false;
    
    return selection.direction === "ROW"
      ? cell.row === selection.value
      : cell.col === selection.value;
  };

  const isCellInSelection = (cell: MatrixCell) => {
    return selection.direction === "ROW"
      ? cell.row === selection.value
      : cell.col === selection.value;
  };

  const isCellHovered = (cell: MatrixCell) => {
    if (!hoveredCell) return false;
    return cell.id === hoveredCell.id;
  };

  return (
    <div className="flex flex-col gap-1">
      {/* Indicateur colonne */}
      {selection.direction === "COL" && (
        <div 
          className="flex gap-1 mb-1"
          style={{ paddingLeft: `calc(${selection.value} * (2.5rem + 0.25rem))` }}
        >
          <div className="w-10 h-1 bg-[var(--text)] opacity-50" />
        </div>
      )}

      <div 
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${matrixSize}, 2.5rem)`,
          gridTemplateRows: `repeat(${matrixSize}, 2.5rem)`,
        }}
      >
        {matrix.map((cell: MatrixCell) => {
          const selectable = isCellSelectable(cell);
          const inSelection = isCellInSelection(cell);
          const selected = cell.isSelected;
          const hovered = isCellHovered(cell);

          return (
            <button
              key={cell.id}
              onClick={() => selectable && selectCell(cell)}
              onMouseEnter={() => selectable && setHoveredCell(cell)}
              onMouseLeave={() => setHoveredCell(null)}
              disabled={!selectable || isFinished}
              className={`
                w-10 h-10 font-mono text-sm font-bold uppercase
                border transition-all duration-150
                flex items-center justify-center
                ${selected
                  ? "bg-[var(--text-muted)]/20 border-[var(--text-muted)] text-[var(--text-muted)] cursor-not-allowed"
                  : selectable
                    ? hovered
                      ? "bg-green-500/30 border-green-500 text-green-400 cursor-pointer scale-110"
                      : "bg-green-500/10 border-green-500/50 text-green-400 cursor-pointer hover:bg-green-500/20"
                    : inSelection
                      ? "bg-[var(--line)]/30 border-[var(--line)] text-[var(--text)]"
                      : "bg-transparent border-[var(--line)]/50 text-[var(--text-muted)]"
                }
              `}
            >
              {cell.code}
            </button>
          );
        })}
      </div>

      {/* Indicateur ligne */}
      {selection.direction === "ROW" && (
        <div 
          className="absolute left-0 flex items-center"
          style={{ 
            top: `calc(${selection.value} * (2.5rem + 0.25rem))`,
            height: "2.5rem",
          }}
        >
          <div className="w-1 h-full bg-[var(--text)] opacity-50 -ml-2" />
        </div>
      )}
    </div>
  );
}
