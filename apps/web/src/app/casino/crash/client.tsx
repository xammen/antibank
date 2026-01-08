"use client";

import { useState } from "react";
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
  const { gameState, isConnected, userBet, cashOut, voteSkip, localMultiplier } = useCrashGame(userId);
  const [showStats, setShowStats] = useState(false);

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
        {/* Header - Compact */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
          <div className="flex items-center gap-4">
            <Link
              href="/casino"
              className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-sm"
            >
              &larr; casino
            </Link>
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
              <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">crash</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Balance initialBalance={userBalance} />
            <span className="text-xs text-[var(--text-muted)]">{userName.toLowerCase()}</span>
          </div>
        </header>

        {/* Main content - Cleaner layout */}
        <div className="flex-1 flex flex-col lg:flex-row">
          
          {/* Graph area - Primary focus */}
          <div className="flex-1 h-[55vh] lg:h-auto relative">
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
                  <div className="px-4 py-1.5 border border-transparent bg-clip-padding"
                    style={{
                      background: "linear-gradient(#0a0a0a, #0a0a0a) padding-box, linear-gradient(90deg, #ff0080, #ff8c00, #40e0d0, #ff0080) border-box",
                      backgroundSize: "300% 100%",
                      animation: "rgb-border 3s linear infinite",
                    }}>
                    <span className="text-xs uppercase tracking-widest"
                      style={{
                        background: "linear-gradient(90deg, #ff0080, #ff8c00, #40e0d0)",
                        backgroundSize: "200% auto",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        animation: "rgb-text 2s linear infinite",
                      }}>
                      big multiplier
                    </span>
                  </div>
                ) : (
                  <div className="px-3 py-1 border border-[var(--line)] bg-[var(--bg)]/90 backdrop-blur-sm">
                    <span className="text-[0.65rem] text-[var(--text-muted)]">
                      big multi dans <span className="text-[var(--text)] tabular-nums font-medium">{gameState.nextBigMultiplierIn}</span>
                    </span>
                  </div>
                )}
              </div>
            )}
            
            {/* History strip - Always visible at bottom of graph */}
            <div className="absolute bottom-3 left-3 right-3 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {gameState.history.slice(0, 12).map((h) => (
                <span
                  key={h.id}
                  className={`text-xs font-mono px-2 py-1 shrink-0 rounded-sm backdrop-blur-sm ${
                    h.crashPoint >= 10 
                      ? "bg-green-500/20 text-green-400 border border-green-500/30" 
                      : h.crashPoint >= 5
                        ? "bg-green-500/10 text-green-400/80"
                        : h.crashPoint >= 2
                          ? "bg-yellow-500/10 text-yellow-400/80"
                          : "bg-red-500/10 text-red-400/80"
                  }`}
                >
                  {h.crashPoint.toFixed(2)}x
                </span>
              ))}
            </div>
          </div>

          {/* Side panel - Streamlined */}
          <div className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-[var(--line)] flex flex-col bg-[#080808]">
            
            {/* Bet panel - Primary interaction */}
            <div className="flex-1 overflow-auto">
              <CrashBetPanel
                gameState={gameState.state}
                userBet={userBet}
                currentMultiplier={displayMultiplier}
                userBalance={userBalance}
                onCashOut={cashOut}
              />
              
              {/* Skip Vote - Only when relevant */}
              {gameState.state === "waiting" && userBet && gameState.countdown > 3 && (
                <div className="px-4 pb-4">
                  <button
                    onClick={voteSkip}
                    className="w-full py-2 text-xs border border-[var(--line)] hover:border-[var(--text-muted)] 
                      hover:bg-[rgba(255,255,255,0.03)] transition-all duration-150 active:scale-[0.98]"
                  >
                    skip ({gameState.skipVotes}/{gameState.skipVotesNeeded})
                  </button>
                </div>
              )}
            </div>

            {/* Players - Compact horizontal */}
            {gameState.players.length > 0 && (
              <div className="px-3 py-2 border-t border-[var(--line)]">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)]">
                    joueurs
                  </span>
                  <span className="text-[0.55rem] px-1.5 py-0.5 bg-white/5 rounded text-[var(--text-muted)]">
                    {gameState.players.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {gameState.players.slice(0, 8).map((player) => (
                    <div
                      key={player.odrzerId}
                      className={`text-[0.6rem] px-1.5 py-0.5 rounded flex items-center gap-1 ${
                        player.cashedOut 
                          ? "bg-green-500/15 text-green-400" 
                          : gameState.state === "crashed" 
                            ? "bg-red-500/15 text-red-400"
                            : "bg-white/5 text-[var(--text-muted)]"
                      }`}
                    >
                      <span className="truncate max-w-[50px]">{player.odrzerame.toLowerCase()}</span>
                      {player.cashedOut && (
                        <span className="font-mono font-medium">{player.cashOutMultiplier?.toFixed(1)}x</span>
                      )}
                    </div>
                  ))}
                  {gameState.players.length > 8 && (
                    <span className="text-[0.6rem] px-1.5 py-0.5 text-[var(--text-muted)]">
                      +{gameState.players.length - 8}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Stats - Collapsible */}
            <div className="border-t border-[var(--line)]">
              <button 
                onClick={() => setShowStats(!showStats)}
                className="w-full px-3 py-2 flex items-center justify-between text-[0.6rem] text-[var(--text-muted)] hover:bg-white/3 transition-colors"
              >
                <span className="uppercase tracking-widest">probabilités</span>
                <span className="opacity-50">{showStats ? "−" : "+"}</span>
              </button>
              
              {showStats && (
                <div className="px-3 pb-3 text-[0.55rem] text-[var(--text-muted)] animate-fade-in">
                  <div className="flex gap-3">
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
                  <div className="mt-2 pt-2 border-t border-[var(--line)] flex justify-between">
                    <span className="opacity-50">taxe maison</span>
                    <span>5%</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </BalanceProvider>
  );
}
