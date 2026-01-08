"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

interface LeaderboardUser {
  id: string;
  name: string;
  balance: string;
  isMe: boolean;
  isAntibank?: boolean;
}

// Odometer digit component - animates individual digits
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

  // For non-numeric characters, just display them
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

// Animated balance display using odometer effect
function AnimatedBalance({ value, isMe, isAntibank }: { value: string; isMe: boolean; isAntibank?: boolean }) {
  const formatted = parseFloat(value).toFixed(2);
  const chars = (formatted + "e").split("");

  const colorClass = isAntibank 
    ? "text-red-400" 
    : isMe 
      ? "text-[var(--text)]" 
      : "text-[var(--text-muted)]";

  return (
    <span className={`font-mono flex ${colorClass}`}>
      {chars.map((char, i) => (
        <OdometerDigit key={i} digit={char} duration={400} />
      ))}
    </span>
  );
}

// Single leaderboard row with position animation
const LeaderboardRow = React.memo(function LeaderboardRow({
  user,
  rank,
  style,
}: {
  user: LeaderboardUser;
  rank: number;
  style: React.CSSProperties;
}) {
  const bgClass = user.isAntibank 
    ? "bg-red-500/5 border-l-2 border-red-500/30" 
    : user.isMe 
      ? "bg-[rgba(255,255,255,0.03)]" 
      : "";

  const nameClass = user.isAntibank
    ? "text-red-400 font-medium"
    : user.isMe 
      ? "text-[var(--text)]" 
      : "text-[var(--text-muted)]";

  return (
    <div
      style={style}
      className={`absolute left-0 right-0 flex items-center justify-between px-3 py-2 transition-all duration-500 ease-out ${bgClass}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-[0.6rem] w-4 ${user.isAntibank ? "text-red-400" : "text-[var(--text-muted)]"}`}>
          {rank}.
        </span>
        <span className={`text-xs truncate ${nameClass}`}>
          {user.isAntibank ? user.name : (user.name?.toLowerCase() || "anon")}
        </span>
      </div>
      <AnimatedBalance value={user.balance} isMe={user.isMe} isAntibank={user.isAntibank} />
    </div>
  );
});

export function Leaderboard() {
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<Map<string, number>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const rowHeight = 36; // Height of each row in pixels

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch("/api/leaderboard");
      const data = await res.json();
      const newUsers: LeaderboardUser[] = data.users || [];

      // Calculate new positions
      const newPositions = new Map<string, number>();
      newUsers.forEach((user, index) => {
        newPositions.set(user.id, index);
      });

      setPositions(newPositions);
      setUsers(newUsers);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
    let interval: ReturnType<typeof setInterval> | null = setInterval(fetchLeaderboard, 10000);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab hidden - pause polling
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      } else {
        // Tab visible - fetch immediately and restart polling
        fetchLeaderboard();
        interval = setInterval(fetchLeaderboard, 10000);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchLeaderboard]);

  if (loading) {
    return (
      <div className="border border-[var(--line)] bg-[rgba(255,255,255,0.01)] p-4">
        <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)] mb-3">
          classement
        </p>
        <p className="text-xs text-[var(--text-muted)]">...</p>
      </div>
    );
  }

  if (users.length === 0) {
    return null;
  }

  return (
    <div className="border border-[var(--line)] bg-[rgba(255,255,255,0.01)]">
      <div className="p-3 border-b border-[var(--line)]">
        <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)]">
          classement
        </p>
      </div>
      <div
        ref={containerRef}
        className="relative overflow-hidden"
        style={{ height: Math.min(users.length * rowHeight, 200) }}
      >
        <div
          className="relative"
          style={{ height: users.length * rowHeight }}
        >
          {users.map((user) => {
            const position = positions.get(user.id) ?? 0;
            return (
              <LeaderboardRow
                key={user.id}
                user={user}
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
