"use client";

import { useState, useEffect } from "react";

interface LeaderboardUser {
  id: string;
  name: string;
  balance: string;
  isMe: boolean;
}

export function Leaderboard() {
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const res = await fetch("/api/leaderboard");
        const data = await res.json();
        setUsers(data.users || []);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 5000); // refresh every 5s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="border border-[var(--line)] bg-[rgba(255,255,255,0.01)] p-4">
        <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)] mb-3">classement</p>
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
        <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)]">classement</p>
      </div>
      <div className="max-h-[200px] overflow-y-auto">
        {users.map((user, index) => (
          <div 
            key={user.id}
            className={`flex items-center justify-between px-3 py-2 border-b border-[var(--line)] last:border-b-0 ${
              user.isMe ? "bg-[rgba(255,255,255,0.03)]" : ""
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[0.6rem] text-[var(--text-muted)] w-4">{index + 1}.</span>
              <span className={`text-xs truncate ${user.isMe ? "text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
                {user.name?.toLowerCase() || "anon"}
              </span>
            </div>
            <span className={`text-xs font-mono ${user.isMe ? "text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
              {parseFloat(user.balance).toFixed(2)}e
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
