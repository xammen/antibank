"use client";

import Link from "next/link";
import { CrashGraph } from "@/components/crash-graph";
import { CrashBetPanel } from "@/components/crash-bet-panel";
import { useCrashGame } from "@/hooks/use-crash-game";
import { Balance } from "@/components/balance";
import { BalanceProvider } from "@/hooks/use-balance";

interface CrashGameClientProps {
  userId: string;
  userBalance: string;
  userName: string;
}

export function CrashGameClient({ userId, userBalance, userName }: CrashGameClientProps) {
  const { gameState, isConnected, userBet, placeBet, cashOut, voteSkip, localMultiplier } = useCrashGame(userId);

  if (!gameState) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-[var(--text-muted)]">
          chargement...
        </div>
      </main>
    );
  }

  // Utiliser localMultiplier pour l'affichage (plus fluide)
  const displayMultiplier = gameState.state === "running" ? localMultiplier : gameState.currentMultiplier;

  return (
    <BalanceProvider initialBalance={userBalance}>
      <main className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between p-4 border-b border-[var(--line)]">
          <div className="flex items-center gap-4">
            <Link
              href="/casino"
              className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-sm"
            >
              &larr; casino
            </Link>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
              <span className="text-sm text-[var(--text-muted)]">crash</span>
            </div>
          </div>
          <div className="text-sm text-[var(--text-muted)]">
            {userName.toLowerCase()}
          </div>
        </header>

        {/* Main content */}
        <div className="flex-1 flex flex-col lg:flex-row">
          {/* Left sidebar - History */}
          <div className="hidden lg:block w-48 border-r border-[var(--line)] p-3 overflow-auto">
            <p className="text-[0.65rem] uppercase tracking-widest text-[var(--text-muted)] mb-3">
              derniers crashs
            </p>
            <div className="flex flex-col gap-1.5">
              {gameState.history.length === 0 && (
                <p className="text-xs text-[var(--text-muted)]">-</p>
              )}
              {gameState.history.map((h, i) => (
                <div
                  key={h.id}
                  className={`text-sm font-mono px-2 py-1 rounded text-center ${
                    h.crashPoint < 2
                      ? "bg-red-500/20 text-red-400"
                      : h.crashPoint < 5
                      ? "bg-yellow-500/20 text-yellow-400"
                      : "bg-green-500/20 text-green-400"
                  }`}
                >
                  x{h.crashPoint.toFixed(2)}
                </div>
              ))}
            </div>
          </div>

          {/* Graph area */}
          <div className="flex-1 h-[50vh] lg:h-auto relative">
            <CrashGraph
              state={gameState.state}
              multiplier={displayMultiplier}
              crashPoint={gameState.crashPoint}
              countdown={gameState.countdown}
              startTime={gameState.startTime}
            />
            
            {/* Mobile history strip */}
            <div className="lg:hidden absolute top-2 left-2 right-2 flex gap-1 overflow-x-auto pb-1">
              {gameState.history.slice(0, 8).map((h) => (
                <span
                  key={h.id}
                  className={`text-xs font-mono px-2 py-0.5 rounded shrink-0 ${
                    h.crashPoint < 2
                      ? "bg-red-500/30 text-red-400"
                      : h.crashPoint < 5
                      ? "bg-yellow-500/30 text-yellow-400"
                      : "bg-green-500/30 text-green-400"
                  }`}
                >
                  x{h.crashPoint.toFixed(2)}
                </span>
              ))}
            </div>
          </div>

          {/* Side panel */}
          <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-[var(--line)] flex flex-col">
            {/* Balance */}
            <div className="p-4 border-b border-[var(--line)]">
              <Balance initialBalance={userBalance} />
            </div>

            {/* Skip Vote (only during waiting and if user has bet) */}
            {gameState.state === "waiting" && userBet && gameState.countdown > 3 && (
              <div className="p-3 border-b border-[var(--line)] bg-[rgba(255,255,255,0.02)]">
                <button
                  onClick={voteSkip}
                  className="w-full py-2 text-xs border border-[var(--line)] hover:border-[var(--text-muted)] 
                    hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                >
                  skip ({gameState.skipVotes}/{gameState.skipVotesNeeded})
                </button>
              </div>
            )}

            {/* Bet panel */}
            <div className="flex-1 overflow-auto">
              <CrashBetPanel
                gameState={gameState.state}
                userBet={userBet}
                currentMultiplier={displayMultiplier}
                userBalance={userBalance}
                onCashOut={cashOut}
              />
            </div>

            {/* Players list */}
            <div className="border-t border-[var(--line)] p-4 max-h-48 overflow-auto">
              <p className="text-[0.7rem] uppercase tracking-widest text-[var(--text-muted)] mb-3">
                joueurs ({gameState.players.length})
              </p>
              <div className="flex flex-col gap-2">
                {gameState.players.length === 0 && (
                  <p className="text-xs text-[var(--text-muted)]">aucun joueur</p>
                )}
                {gameState.players.map((player) => (
                  <div
                    key={player.odrzerId}
                    className={`flex items-center justify-between text-xs p-2 border border-[var(--line)] ${
                      player.cashedOut 
                        ? "bg-green-500/10 border-green-500/30" 
                        : gameState.state === "crashed" 
                          ? "bg-red-500/10 border-red-500/30"
                          : ""
                    }`}
                  >
                    <span className="truncate max-w-[100px]">
                      {player.odrzerame.toLowerCase()}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--text-muted)]">{player.bet}€</span>
                      {player.cashedOut && (
                        <span className="text-green-400">
                          x{player.cashOutMultiplier?.toFixed(2)}
                        </span>
                      )}
                      {!player.cashedOut && gameState.state === "crashed" && (
                        <span className="text-red-400">perdu</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </BalanceProvider>
  );
}
