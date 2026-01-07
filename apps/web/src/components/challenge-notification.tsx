"use client";

import { useState, useEffect, useCallback } from "react";

interface Challenge {
  id: string;
  amount: number | string;
  gameType: "dice" | "pfc";
  challenger: string;
}

interface ChallengeNotificationProps {
  challenges: Challenge[];
  onAccept: (challenge: Challenge) => void;
  onDismiss: (challengeId: string) => void;
}

export function ChallengeNotification({ challenges, onAccept, onDismiss }: ChallengeNotificationProps) {
  const [visibleChallenges, setVisibleChallenges] = useState<Challenge[]>([]);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());

  // Detect new challenges
  useEffect(() => {
    const newChallenges = challenges.filter(c => !seenIds.has(c.id));
    if (newChallenges.length > 0) {
      setVisibleChallenges(prev => [...prev, ...newChallenges]);
      setSeenIds(prev => {
        const next = new Set(prev);
        newChallenges.forEach(c => next.add(c.id));
        return next;
      });
    }
  }, [challenges, seenIds]);

  // Remove challenges that are no longer in the list (accepted/expired elsewhere)
  useEffect(() => {
    const currentIds = new Set(challenges.map(c => c.id));
    setVisibleChallenges(prev => prev.filter(c => currentIds.has(c.id)));
  }, [challenges]);

  const handleAccept = useCallback((challenge: Challenge) => {
    setVisibleChallenges(prev => prev.filter(c => c.id !== challenge.id));
    onAccept(challenge);
  }, [onAccept]);

  const handleDismiss = useCallback((challengeId: string) => {
    setVisibleChallenges(prev => prev.filter(c => c.id !== challengeId));
    onDismiss(challengeId);
  }, [onDismiss]);

  if (visibleChallenges.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {visibleChallenges.map((challenge, index) => (
        <div
          key={challenge.id}
          className="challenge-toast"
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <style jsx>{`
            .challenge-toast {
              background: var(--bg);
              border: 1px solid var(--line);
              padding: 1rem;
              animation: slideIn 0.3s ease-out forwards, pulse 2s ease-in-out infinite;
              box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            }

            @keyframes slideIn {
              from {
                opacity: 0;
                transform: translateX(100%);
              }
              to {
                opacity: 1;
                transform: translateX(0);
              }
            }

            @keyframes pulse {
              0%, 100% {
                border-color: var(--line);
              }
              50% {
                border-color: #fbbf24;
              }
            }

            .challenge-icon {
              font-size: 1.5rem;
              animation: bounce 0.5s ease-in-out infinite alternate;
            }

            @keyframes bounce {
              from { transform: translateY(0); }
              to { transform: translateY(-3px); }
            }
          `}</style>

          <div className="flex items-start gap-3">
            <span className="challenge-icon">
              {challenge.gameType === "dice" ? "🎲" : "✊"}
            </span>
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text)]">
                defi {challenge.gameType === "dice" ? "des" : "pfc"}!
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                <span className="text-[var(--text)]">{challenge.challenger.toLowerCase()}</span>
                {" "}te defie pour{" "}
                <span className="text-yellow-400 font-mono">{String(challenge.amount)}€</span>
              </p>
              
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => handleAccept(challenge)}
                  className="flex-1 py-1.5 text-xs uppercase tracking-wider bg-green-500/20 text-green-400 border border-green-500/50 hover:bg-green-500/30 transition-colors"
                >
                  jouer
                </button>
                <button
                  onClick={() => handleDismiss(challenge.id)}
                  className="px-3 py-1.5 text-xs text-[var(--text-muted)] border border-[var(--line)] hover:border-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
