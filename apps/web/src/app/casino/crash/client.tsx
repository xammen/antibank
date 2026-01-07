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
          {/* Graph area */}
          <div className="flex-1 h-[50vh] lg:h-auto relative">
            <CrashGraph
              state={gameState.state}
              multiplier={displayMultiplier}
              crashPoint={gameState.crashPoint}
              countdown={gameState.countdown}
              startTime={gameState.startTime}
            />
            
            {/* Big Multiplier Indicator */}
            {gameState.nextBigMultiplierIn <= 5 && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
                {gameState.nextBigMultiplierIn === 0 ? (
                  <div className="px-4 py-1.5 border border-transparent bg-clip-padding animate-pulse"
                    style={{
                      background: "linear-gradient(#0a0a0a, #0a0a0a) padding-box, linear-gradient(90deg, #ff0080, #ff8c00, #40e0d0, #ff0080) border-box",
                      backgroundSize: "300% 100%",
                      animation: "rgb-border 3s linear infinite, pulse 1.5s ease-in-out infinite",
                    }}>
                    <span className="text-xs uppercase tracking-widest"
                      style={{
                        background: "linear-gradient(90deg, #ff0080, #ff8c00, #40e0d0)",
                        backgroundSize: "200% auto",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        animation: "rgb-text 2s linear infinite",
                      }}>
                      big multiplier (30%)
                    </span>
                  </div>
                ) : (
                  <div className="px-3 py-1 border border-[var(--line)] bg-[var(--bg)]/80 backdrop-blur-sm">
                    <span className="text-[0.65rem] text-[var(--text-muted)]">
                      big multi dans <span className="text-[var(--text)] tabular-nums">{gameState.nextBigMultiplierIn}</span> partie{gameState.nextBigMultiplierIn > 1 ? "s" : ""}
                    </span>
                  </div>
                )}
              </div>
            )}
            
            {/* Mobile history strip */}
            <div className="lg:hidden absolute bottom-2 left-2 right-2 flex gap-1 overflow-x-auto pb-1">
              {gameState.history.slice(0, 8).map((h) => (
                <span
                  key={h.id}
                  className={`text-xs font-mono px-2 py-0.5 shrink-0 border ${
                    h.crashPoint < 2
                      ? "border-red-500/30 text-red-400"
                      : h.crashPoint < 5
                      ? "border-yellow-500/30 text-yellow-400"
                      : "border-green-500/30 text-green-400"
                  }`}
                >
                  x{h.crashPoint.toFixed(2)}
                </span>
              ))}
            </div>
          </div>

          {/* Side panel - Reorganized for clarity */}
          <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-[var(--line)] flex flex-col bg-[#080808]">
            
            {/* Header: Balance + Game History inline */}
            <div className="p-3 border-b border-[var(--line)] flex items-center justify-between gap-3">
              <Balance initialBalance={userBalance} />
              {/* Compact history pills */}
              <div className="hidden lg:flex gap-1 overflow-hidden">
                {gameState.history.slice(0, 5).map((h) => (
                  <span
                    key={h.id}
                    className={`text-[0.6rem] font-mono px-1.5 py-0.5 rounded ${
                      h.crashPoint >= 5 ? "bg-green-500/20 text-green-400" : 
                      h.crashPoint >= 2 ? "bg-yellow-500/20 text-yellow-400" : 
                      "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {h.crashPoint.toFixed(2)}
                  </span>
                ))}
              </div>
            </div>

            {/* Bet panel - Main interaction area */}
            <div className="flex-1 overflow-auto">
              <CrashBetPanel
                gameState={gameState.state}
                userBet={userBet}
                currentMultiplier={displayMultiplier}
                userBalance={userBalance}
                onCashOut={cashOut}
              />
              
              {/* Skip Vote inline with bet panel */}
              {gameState.state === "waiting" && userBet && gameState.countdown > 3 && (
                <div className="px-4 pb-4">
                  <button
                    onClick={voteSkip}
                    className="w-full py-2 text-xs border border-[var(--line)] hover:border-[var(--text-muted)] 
                      hover:bg-[rgba(255,255,255,0.03)] transition-colors rounded"
                  >
                    skip ({gameState.skipVotes}/{gameState.skipVotesNeeded})
                  </button>
                </div>
              )}
            </div>

            {/* Players + Stats combined section */}
            <div className="border-t border-[var(--line)]">
              {/* Players - horizontal compact view */}
              {gameState.players.length > 0 && (
                <div className="p-3 border-b border-[var(--line)]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)]">
                      joueurs
                    </span>
                    <span className="text-[0.6rem] text-[var(--text-muted)] opacity-50">
                      {gameState.players.length}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {gameState.players.map((player) => (
                      <div
                        key={player.odrzerId}
                        className={`text-[0.65rem] px-2 py-1 rounded flex items-center gap-1.5 ${
                          player.cashedOut 
                            ? "bg-green-500/10 text-green-400" 
                            : gameState.state === "crashed" 
                              ? "bg-red-500/10 text-red-400"
                              : "bg-white/5 text-[var(--text-muted)]"
                        }`}
                      >
                        <span className="truncate max-w-[60px]">{player.odrzerame.toLowerCase()}</span>
                        <span className="font-mono opacity-70">{player.bet}€</span>
                        {player.cashedOut && (
                          <span className="font-mono font-medium">×{player.cashOutMultiplier?.toFixed(2)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Stats footer - cleaner layout */}
              <div className="p-3 text-[0.55rem] text-[var(--text-muted)]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="uppercase tracking-widest opacity-60">probabilités</span>
                  <span className="opacity-40">5% taxe</span>
                </div>
                <div className="flex gap-3 text-[0.6rem]">
                  <div className="flex-1 space-y-0.5">
                    <div className="flex justify-between">
                      <span className="opacity-60">&lt;2×</span>
                      <span>52%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="opacity-60">&lt;5×</span>
                      <span>79%</span>
                    </div>
                  </div>
                  <div className="w-px bg-[var(--line)]" />
                  <div className="flex-1 space-y-0.5">
                    <div className="flex justify-between">
                      <span className="text-green-400/70">&gt;10×</span>
                      <span className="text-green-400">11%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-green-400/70">&gt;50×</span>
                      <span className="text-green-400">2%</span>
                    </div>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-[var(--line)] opacity-50 text-center">
                  1% legendary · 2% epic
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </BalanceProvider>
  );
}
