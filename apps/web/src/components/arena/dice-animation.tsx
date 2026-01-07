"use client";

import { useState, useEffect, type ReactNode } from "react";

interface DiceAnimationProps {
  players: {
    id: string;
    username: string;
    odrzerId: string;
    dice1?: number | null;
    dice2?: number | null;
    roll?: number | null;
    rank?: number | null;
    profit?: number | null;
  }[];
  currentUserId: string;
  onComplete: () => void;
}

// Faces du dé avec points
const DICE_FACES: Record<number, ReactNode> = {
  1: (
    <div className="dice-face">
      <span className="dot center" />
    </div>
  ),
  2: (
    <div className="dice-face">
      <span className="dot top-right" />
      <span className="dot bottom-left" />
    </div>
  ),
  3: (
    <div className="dice-face">
      <span className="dot top-right" />
      <span className="dot center" />
      <span className="dot bottom-left" />
    </div>
  ),
  4: (
    <div className="dice-face">
      <span className="dot top-left" />
      <span className="dot top-right" />
      <span className="dot bottom-left" />
      <span className="dot bottom-right" />
    </div>
  ),
  5: (
    <div className="dice-face">
      <span className="dot top-left" />
      <span className="dot top-right" />
      <span className="dot center" />
      <span className="dot bottom-left" />
      <span className="dot bottom-right" />
    </div>
  ),
  6: (
    <div className="dice-face">
      <span className="dot top-left" />
      <span className="dot top-right" />
      <span className="dot middle-left" />
      <span className="dot middle-right" />
      <span className="dot bottom-left" />
      <span className="dot bottom-right" />
    </div>
  ),
};

type Phase = "rolling" | "reveal" | "results";

export function DiceAnimation({ players, currentUserId, onComplete }: DiceAnimationProps) {
  const [phase, setPhase] = useState<Phase>("rolling");
  const [rollingValues, setRollingValues] = useState<{ d1: number; d2: number }[]>(
    players.map(() => ({ d1: 1, d2: 1 }))
  );
  const [revealedIndex, setRevealedIndex] = useState(-1);

  // Phase 1: Rolling animation (2s)
  useEffect(() => {
    if (phase !== "rolling") return;

    const interval = setInterval(() => {
      setRollingValues(
        players.map(() => ({
          d1: Math.floor(Math.random() * 6) + 1,
          d2: Math.floor(Math.random() * 6) + 1,
        }))
      );
    }, 80);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      setPhase("reveal");
    }, 2000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [phase, players]);

  // Phase 2: Reveal one by one (0.8s per player)
  useEffect(() => {
    if (phase !== "reveal") return;

    const sortedPlayers = [...players].sort((a, b) => (b.rank || 99) - (a.rank || 99));
    
    const revealNext = (index: number) => {
      if (index >= sortedPlayers.length) {
        setTimeout(() => setPhase("results"), 500);
        return;
      }

      setRevealedIndex(index);
      setTimeout(() => revealNext(index + 1), 800);
    };

    revealNext(0);
  }, [phase, players]);

  // Phase 3: Show results then complete
  useEffect(() => {
    if (phase !== "results") return;

    const timeout = setTimeout(() => {
      onComplete();
    }, 3000);

    return () => clearTimeout(timeout);
  }, [phase, onComplete]);

  // Sort players by rank (worst to best for reveal)
  const sortedPlayers = [...players].sort((a, b) => (b.rank || 99) - (a.rank || 99));

  return (
    <div className="dice-animation-container">
      <style jsx>{`
        .dice-animation-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
          padding: 1rem 0;
        }

        .phase-title {
          font-size: 1.25rem;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: var(--text);
          animation: pulse 0.5s ease-in-out infinite alternate;
        }

        @keyframes pulse {
          from { opacity: 0.6; }
          to { opacity: 1; }
        }

        .players-grid {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          width: 100%;
        }

        .player-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1rem;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.02);
          transition: all 0.3s ease;
        }

        .player-row.revealed {
          border-color: var(--text);
          background: rgba(255, 255, 255, 0.05);
        }

        .player-row.winner {
          border-color: #4ade80;
          background: rgba(74, 222, 128, 0.1);
        }

        .player-row.current-user {
          box-shadow: inset 0 0 0 1px var(--text-muted);
        }

        .player-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .player-rank {
          font-size: 1.25rem;
          min-width: 2rem;
        }

        .player-name {
          font-size: 0.875rem;
          color: var(--text);
        }

        .dice-container {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .dice {
          width: 40px;
          height: 40px;
          background: var(--bg);
          border: 1px solid var(--line);
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        .dice.rolling {
          animation: shake 0.1s ease-in-out infinite;
        }

        .dice.revealed {
          animation: pop 0.3s ease-out;
          border-color: var(--text);
        }

        @keyframes shake {
          0%, 100% { transform: rotate(-5deg) scale(1.05); }
          50% { transform: rotate(5deg) scale(0.95); }
        }

        @keyframes pop {
          0% { transform: scale(0.8); }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }

        .dice-face {
          width: 100%;
          height: 100%;
          position: relative;
        }

        .dot {
          position: absolute;
          width: 6px;
          height: 6px;
          background: var(--text);
          border-radius: 50%;
        }

        .dot.center { top: 50%; left: 50%; transform: translate(-50%, -50%); }
        .dot.top-left { top: 6px; left: 6px; }
        .dot.top-right { top: 6px; right: 6px; }
        .dot.middle-left { top: 50%; left: 6px; transform: translateY(-50%); }
        .dot.middle-right { top: 50%; right: 6px; transform: translateY(-50%); }
        .dot.bottom-left { bottom: 6px; left: 6px; }
        .dot.bottom-right { bottom: 6px; right: 6px; }

        .dice-total {
          font-size: 1.25rem;
          font-weight: bold;
          min-width: 2rem;
          text-align: center;
          color: var(--text);
        }

        .dice-total.hidden {
          color: var(--text-muted);
        }

        .profit {
          font-size: 0.875rem;
          min-width: 4rem;
          text-align: right;
        }

        .profit.positive { color: #4ade80; }
        .profit.negative { color: #f87171; }

        .results-summary {
          margin-top: 1rem;
          text-align: center;
          animation: fadeIn 0.5s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .result-message {
          font-size: 1.5rem;
          margin-bottom: 0.5rem;
        }

        .result-profit {
          font-size: 1.25rem;
        }
      `}</style>

      {phase === "rolling" && (
        <div className="phase-title">lancer des des...</div>
      )}

      {phase === "reveal" && (
        <div className="phase-title">resultats</div>
      )}

      <div className="players-grid">
        {(phase === "rolling" ? players : sortedPlayers).map((player, index) => {
          const originalIndex = players.findIndex((p) => p.id === player.id);
          const isRevealed = phase === "reveal" ? index <= revealedIndex : phase === "results";
          const isWinner = player.rank === 1;
          const isCurrentUser = player.odrzerId === currentUserId;

          const d1 = isRevealed ? player.dice1 || 1 : rollingValues[originalIndex]?.d1 || 1;
          const d2 = isRevealed ? player.dice2 || 1 : rollingValues[originalIndex]?.d2 || 1;

          return (
            <div
              key={player.id}
              className={`player-row ${isRevealed ? "revealed" : ""} ${isWinner && isRevealed ? "winner" : ""} ${isCurrentUser ? "current-user" : ""}`}
            >
              <div className="player-info">
                <span className="player-rank">
                  {isRevealed && phase !== "rolling"
                    ? player.rank === 1
                      ? "🥇"
                      : player.rank === 2
                        ? "🥈"
                        : player.rank === 3
                          ? "🥉"
                          : `#${player.rank}`
                    : "?"}
                </span>
                <span className="player-name">{player.username}</span>
              </div>

              <div className="dice-container">
                <div className={`dice ${phase === "rolling" ? "rolling" : ""} ${isRevealed ? "revealed" : ""}`}>
                  {DICE_FACES[d1]}
                </div>
                <div className={`dice ${phase === "rolling" ? "rolling" : ""} ${isRevealed ? "revealed" : ""}`}>
                  {DICE_FACES[d2]}
                </div>
                <span className={`dice-total ${!isRevealed ? "hidden" : ""}`}>
                  {isRevealed ? player.roll : "?"}
                </span>
              </div>

              {phase === "results" && (
                <span className={`profit ${(player.profit || 0) >= 0 ? "positive" : "negative"}`}>
                  {(player.profit || 0) >= 0 ? "+" : ""}
                  {player.profit?.toFixed(2)}€
                </span>
              )}
            </div>
          );
        })}
      </div>

      {phase === "results" && (
        <div className="results-summary">
          {(() => {
            const me = players.find((p) => p.odrzerId === currentUserId);
            if (!me) return null;

            return (
              <>
                <div className="result-message">
                  {me.rank === 1 ? "🎉 victoire!" : me.rank === 2 ? "pas mal!" : "dommage..."}
                </div>
                <div className={`result-profit ${(me.profit || 0) >= 0 ? "positive" : "negative"}`}>
                  {(me.profit || 0) >= 0 ? "+" : ""}
                  {me.profit?.toFixed(2)}€
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
