"use client";

import { useState, useEffect } from "react";

interface PFCAnimationProps {
  players: {
    id: string;
    username: string;
    odrzerId: string;
    choice?: "pierre" | "feuille" | "ciseaux" | null;
    rank?: number | null;
    profit?: number | null;
  }[];
  currentUserId: string;
  onComplete: () => void;
}

const CHOICE_EMOJI: Record<string, string> = {
  pierre: "🪨",
  feuille: "📄",
  ciseaux: "✂️",
};

const CHOICE_LABEL: Record<string, string> = {
  pierre: "pierre",
  feuille: "feuille",
  ciseaux: "ciseaux",
};

type Phase = "countdown" | "shaking" | "reveal" | "results";

export function PFCAnimation({ players, currentUserId, onComplete }: PFCAnimationProps) {
  const [phase, setPhase] = useState<Phase>("countdown");
  const [countdownValue, setCountdownValue] = useState(3);
  const [revealedIndex, setRevealedIndex] = useState(-1);
  const [shakingEmoji, setShakingEmoji] = useState("✊");

  // Phase 1: Countdown 3-2-1
  useEffect(() => {
    if (phase !== "countdown") return;

    if (countdownValue === 0) {
      setPhase("shaking");
      return;
    }

    const timeout = setTimeout(() => {
      setCountdownValue((v) => v - 1);
    }, 800);

    return () => clearTimeout(timeout);
  }, [phase, countdownValue]);

  // Phase 2: Shaking hands animation
  useEffect(() => {
    if (phase !== "shaking") return;

    const emojis = ["✊", "✋", "✊", "✋"];
    let index = 0;

    const interval = setInterval(() => {
      index = (index + 1) % emojis.length;
      setShakingEmoji(emojis[index]);
    }, 150);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      setPhase("reveal");
    }, 1500);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [phase]);

  // Phase 3: Reveal choices one by one
  useEffect(() => {
    if (phase !== "reveal") return;

    const revealNext = (index: number) => {
      if (index >= players.length) {
        setTimeout(() => setPhase("results"), 500);
        return;
      }

      setRevealedIndex(index);
      setTimeout(() => revealNext(index + 1), 600);
    };

    revealNext(0);
  }, [phase, players.length]);

  // Phase 4: Show results then complete
  useEffect(() => {
    if (phase !== "results") return;

    const timeout = setTimeout(() => {
      onComplete();
    }, 3000);

    return () => clearTimeout(timeout);
  }, [phase, onComplete]);

  // Sort players by rank for results
  const sortedByRank = [...players].sort((a, b) => (a.rank || 99) - (b.rank || 99));

  return (
    <div className="pfc-animation-container">
      <style jsx>{`
        .pfc-animation-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
          padding: 1rem 0;
          min-height: 300px;
        }

        .countdown-display {
          font-size: 5rem;
          font-weight: bold;
          animation: countdownPop 0.4s ease-out;
        }

        @keyframes countdownPop {
          0% { transform: scale(1.5); opacity: 0; }
          50% { transform: scale(0.9); }
          100% { transform: scale(1); opacity: 1; }
        }

        .countdown-text {
          font-size: 1rem;
          text-transform: uppercase;
          letter-spacing: 0.3em;
          color: var(--text-muted);
          margin-top: -1rem;
        }

        .shaking-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }

        .shaking-hands {
          display: flex;
          gap: 2rem;
          font-size: 4rem;
        }

        .shaking-hand {
          animation: shake 0.15s ease-in-out infinite;
        }

        .shaking-hand:nth-child(2) {
          animation-delay: 0.075s;
        }

        @keyframes shake {
          0%, 100% { transform: translateY(0) rotate(-5deg); }
          50% { transform: translateY(-15px) rotate(5deg); }
        }

        .shaking-text {
          font-size: 1.25rem;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          animation: pulse 0.3s ease-in-out infinite alternate;
        }

        @keyframes pulse {
          from { opacity: 0.5; }
          to { opacity: 1; }
        }

        .players-reveal {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 1rem;
          width: 100%;
        }

        .player-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 1rem 1.5rem;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.02);
          min-width: 100px;
          transition: all 0.3s ease;
        }

        .player-card.revealed {
          animation: cardReveal 0.4s ease-out;
        }

        .player-card.winner {
          border-color: #4ade80;
          background: rgba(74, 222, 128, 0.1);
        }

        .player-card.loser {
          opacity: 0.5;
        }

        .player-card.current-user {
          box-shadow: inset 0 0 0 1px var(--text-muted);
        }

        @keyframes cardReveal {
          0% { transform: scale(0.8) rotateY(90deg); opacity: 0; }
          50% { transform: scale(1.1) rotateY(0deg); }
          100% { transform: scale(1) rotateY(0deg); opacity: 1; }
        }

        .player-name {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-bottom: 0.5rem;
          text-align: center;
        }

        .player-choice {
          font-size: 3rem;
          line-height: 1;
        }

        .player-choice.hidden {
          filter: blur(8px);
        }

        .player-choice-label {
          font-size: 0.625rem;
          color: var(--text-muted);
          margin-top: 0.5rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .player-rank {
          font-size: 1.5rem;
          margin-top: 0.5rem;
        }

        .results-container {
          width: 100%;
        }

        .results-header {
          text-align: center;
          font-size: 1.25rem;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          margin-bottom: 1rem;
          animation: fadeIn 0.5s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .results-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .result-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1rem;
          border: 1px solid var(--line);
          animation: slideIn 0.3s ease-out;
          animation-fill-mode: both;
        }

        .result-row:nth-child(1) { animation-delay: 0.1s; }
        .result-row:nth-child(2) { animation-delay: 0.2s; }
        .result-row:nth-child(3) { animation-delay: 0.3s; }
        .result-row:nth-child(4) { animation-delay: 0.4s; }

        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }

        .result-row.winner {
          border-color: #4ade80;
          background: rgba(74, 222, 128, 0.1);
        }

        .result-row.current-user {
          box-shadow: inset 0 0 0 1px var(--text-muted);
        }

        .result-left {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .result-rank {
          font-size: 1.25rem;
          min-width: 2rem;
        }

        .result-emoji {
          font-size: 1.5rem;
        }

        .result-name {
          font-size: 0.875rem;
        }

        .result-choice {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .result-profit {
          font-size: 0.875rem;
        }

        .result-profit.positive { color: #4ade80; }
        .result-profit.negative { color: #f87171; }

        .my-result {
          margin-top: 1.5rem;
          text-align: center;
          animation: fadeIn 0.5s ease-out 0.5s both;
        }

        .my-result-message {
          font-size: 1.5rem;
        }

        .my-result-profit {
          font-size: 1.25rem;
          margin-top: 0.25rem;
        }
      `}</style>

      {/* Phase 1: Countdown */}
      {phase === "countdown" && (
        <>
          <div className="countdown-display" key={countdownValue}>
            {countdownValue}
          </div>
          <div className="countdown-text">pierre feuille ciseaux...</div>
        </>
      )}

      {/* Phase 2: Shaking hands */}
      {phase === "shaking" && (
        <div className="shaking-container">
          <div className="shaking-hands">
            {players.map((player) => (
              <span key={player.id} className="shaking-hand">
                {shakingEmoji}
              </span>
            ))}
          </div>
          <div className="shaking-text">chi...fou...mi!</div>
        </div>
      )}

      {/* Phase 3: Reveal */}
      {phase === "reveal" && (
        <div className="players-reveal">
          {players.map((player, index) => {
            const isRevealed = index <= revealedIndex;
            const isCurrentUser = player.odrzerId === currentUserId;

            return (
              <div
                key={player.id}
                className={`player-card ${isRevealed ? "revealed" : ""} ${isCurrentUser ? "current-user" : ""}`}
              >
                <div className="player-name">{player.username}</div>
                <div className={`player-choice ${!isRevealed ? "hidden" : ""}`}>
                  {player.choice ? CHOICE_EMOJI[player.choice] : "❓"}
                </div>
                {isRevealed && player.choice && (
                  <div className="player-choice-label">{CHOICE_LABEL[player.choice]}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Phase 4: Results */}
      {phase === "results" && (
        <div className="results-container">
          <div className="results-header">resultats</div>
          <div className="results-list">
            {sortedByRank.map((player) => {
              const isWinner = player.rank === 1;
              const isCurrentUser = player.odrzerId === currentUserId;

              return (
                <div
                  key={player.id}
                  className={`result-row ${isWinner ? "winner" : ""} ${isCurrentUser ? "current-user" : ""}`}
                >
                  <div className="result-left">
                    <span className="result-rank">
                      {player.rank === 1 ? "🥇" : player.rank === 2 ? "🥈" : player.rank === 3 ? "🥉" : `#${player.rank}`}
                    </span>
                    <span className="result-emoji">
                      {player.choice ? CHOICE_EMOJI[player.choice] : "❓"}
                    </span>
                    <div>
                      <div className="result-name">{player.username}</div>
                      <div className="result-choice">{player.choice ? CHOICE_LABEL[player.choice] : "?"}</div>
                    </div>
                  </div>
                  <span className={`result-profit ${(player.profit || 0) >= 0 ? "positive" : "negative"}`}>
                    {(player.profit || 0) >= 0 ? "+" : ""}
                    {player.profit?.toFixed(2)}€
                  </span>
                </div>
              );
            })}
          </div>

          <div className="my-result">
            {(() => {
              const me = players.find((p) => p.odrzerId === currentUserId);
              if (!me) return null;

              return (
                <>
                  <div className="my-result-message">
                    {me.rank === 1 ? "🎉 victoire!" : me.rank === 2 ? "pas mal!" : "dommage..."}
                  </div>
                  <div className={`my-result-profit ${(me.profit || 0) >= 0 ? "positive" : "negative"}`}>
                    {(me.profit || 0) >= 0 ? "+" : ""}
                    {me.profit?.toFixed(2)}€
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
