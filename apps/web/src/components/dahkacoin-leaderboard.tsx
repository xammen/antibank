"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

interface WhaleHolder {
  username: string;
  dcBalance: number;
  euroValue: number;
  profitPercent: number | null;
}

// Odometer digit component
const OdometerDigit = React.memo(function OdometerDigit({ digit, duration = 500 }: { digit: string; duration?: number }) {
  const [displayDigit, setDisplayDigit] = useState(digit);
  const [isAnimating, setIsAnimating] = useState(false);
  const prevDigit = useRef(digit);

  useEffect(() => {
    if (digit !== prevDigit.current) {
      setIsAnimating(true);
      const timeout = setTimeout(() => {
        setDisplayDigit(digit);
        setIsAnimating(false);
        prevDigit.current = digit;
      }, duration / 2);
      return () => clearTimeout(timeout);
    }
  }, [digit, duration]);

  if (!/\d/.test(digit)) {
    return <span className="inline-block">{digit}</span>;
  }

  return (
    <span className="inline-block relative overflow-hidden h-[1.2em] w-[0.6em]">
      <span
        className={`inline-block transition-transform ${isAnimating ? "duration-300" : "duration-0"}`}
        style={{
          transform: isAnimating ? "translateY(-100%)" : "translateY(0)",
        }}
      >
        {displayDigit}
      </span>
      {isAnimating && (
        <span
          className="absolute top-full left-0 inline-block transition-transform duration-300"
          style={{
            transform: isAnimating ? "translateY(-100%)" : "translateY(0)",
          }}
        >
          {digit}
        </span>
      )}
    </span>
  );
});

function AnimatedDCBalance({ value }: { value: number }) {
  const formatted = value.toFixed(2);
  const chars = (formatted + " dc").split("");

  return (
    <span className="font-mono flex text-purple-400 text-[0.75rem]">
      {chars.map((char, i) => (
        <OdometerDigit key={i} digit={char} duration={400} />
      ))}
    </span>
  );
}

const DCLeaderboardRow = React.memo(function DCLeaderboardRow({
  whale,
  rank,
  style,
}: {
  whale: WhaleHolder;
  rank: number;
  style: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className="absolute left-0 right-0 flex items-center justify-between px-3 py-2 transition-all duration-500 ease-out"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[0.6rem] w-4 text-[var(--text-muted)]">
          {rank}.
        </span>
        <span className="text-xs truncate text-[var(--text-muted)]">
          {whale.username?.toLowerCase() || "anon"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <AnimatedDCBalance value={whale.dcBalance} />
        {whale.profitPercent !== null && (
          <span
            className={`text-[0.6rem] ${
              whale.profitPercent >= 0 ? "text-green-400" : "text-red-400"
            }`}
          >
            {whale.profitPercent >= 0 ? "+" : ""}
            {whale.profitPercent.toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
});

export function DahkaCoinLeaderboard() {
  const [whales, setWhales] = useState<WhaleHolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<Map<string, number>>(new Map());
  const rowHeight = 36;

  const fetchWhales = useCallback(async () => {
    try {
      const res = await fetch("/api/dahkacoin/whales");
      const data = await res.json();
      const newWhales: WhaleHolder[] = data.whales || [];

      const newPositions = new Map<string, number>();
      newWhales.forEach((whale, index) => {
        newPositions.set(whale.username, index);
      });

      setPositions(newPositions);
      setWhales(newWhales);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWhales();
    let interval: ReturnType<typeof setInterval> | null = setInterval(fetchWhales, 10000);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      } else {
        fetchWhales();
        interval = setInterval(fetchWhales, 10000);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchWhales]);

  if (loading) {
    return (
      <div className="border border-purple-500/30 bg-purple-500/5 p-4">
        <p className="text-[0.6rem] uppercase tracking-widest text-purple-400 mb-3">
          whales dc
        </p>
        <p className="text-xs text-[var(--text-muted)]">...</p>
      </div>
    );
  }

  if (whales.length === 0) {
    return (
      <div className="border border-purple-500/30 bg-purple-500/5 p-4">
        <p className="text-[0.6rem] uppercase tracking-widest text-purple-400 mb-3">
          whales dc
        </p>
        <p className="text-xs text-[var(--text-muted)]">aucun holder</p>
      </div>
    );
  }

  return (
    <div className="border border-purple-500/30 bg-purple-500/5">
      <div className="p-3 border-b border-purple-500/20">
        <p className="text-[0.6rem] uppercase tracking-widest text-purple-400">
          whales dc
        </p>
      </div>
      <div
        className="relative overflow-hidden"
        style={{ height: Math.min(whales.length * rowHeight, 200) }}
      >
        <div
          className="relative"
          style={{ height: whales.length * rowHeight }}
        >
          {whales.map((whale) => {
            const position = positions.get(whale.username) ?? 0;
            return (
              <DCLeaderboardRow
                key={whale.username}
                whale={whale}
                rank={position + 1}
                style={{
                  top: position * rowHeight,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
