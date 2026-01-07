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

          {/* Side panel */}
          <div className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-[var(--line)] flex flex-col">
            {/* Balance */}
            <div className="p-4 border-b border-[var(--line)]">
              <Balance initialBalance={userBalance} />
            </div>

            {/* Skip Vote (only during waiting and if user has bet) */}
            {gameState.state === "waiting" && userBet && gameState.countdown > 3 && (
              <div className="p-3 border-b border-[var(--line)]">
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
            <div className="border-t border-[var(--line)] p-3 max-h-36 overflow-auto">
              <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)] mb-2">
                joueurs ({gameState.players.length})
              </p>
              <div className="flex flex-col gap-1">
                {gameState.players.length === 0 && (
                  <p className="text-xs text-[var(--text-muted)]">aucun</p>
                )}
                {gameState.players.map((player) => (
                  <div
                    key={player.odrzerId}
                    className={`flex items-center justify-between text-xs px-2 py-1.5 border ${
                      player.cashedOut 
                        ? "border-green-500/30 bg-green-500/5" 
                        : gameState.state === "crashed" 
                          ? "border-red-500/30 bg-red-500/5"
                          : "border-[var(--line)]"
                    }`}
                  >
                    <span className="truncate max-w-[80px] text-[var(--text-muted)]">
                      {player.odrzerame.toLowerCase()}
                    </span>
                    <div className="flex items-center gap-2 tabular-nums">
                      <span className="text-[var(--text-muted)]">{player.bet}€</span>
                      {player.cashedOut && (
                        <span className="text-green-400">
                          x{player.cashOutMultiplier?.toFixed(2)}
                        </span>
                      )}
                      {!player.cashedOut && gameState.state === "crashed" && (
                        <span className="text-red-400">-</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* History */}
            {gameState.history.length > 0 && (
              <div className="hidden lg:block border-t border-[var(--line)] max-h-40 overflow-y-auto">
                <div className="p-2 border-b border-[var(--line)] sticky top-0 bg-[var(--bg)]">
                  <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)]">historique</p>
                </div>
                <div className="divide-y divide-[var(--line)]">
                  {gameState.history.map((h) => (
                    <div 
                      key={h.id} 
                      className={`px-3 py-1.5 ${
                        h.crashPoint >= 5 ? "bg-green-500/5" : 
                        h.crashPoint >= 2 ? "bg-yellow-500/5" : 
                        "bg-red-500/5"
                      }`}
                    >
                      <span className={`text-sm font-mono tabular-nums ${
                        h.crashPoint >= 5 ? "text-green-400" : 
                        h.crashPoint >= 2 ? "text-yellow-400" : 
                        "text-red-400"
                      }`}>
                        x{h.crashPoint.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stats & Rules */}
            <div className="p-3 border-t border-[var(--line)] text-[0.55rem] text-[var(--text-muted)]">
              <div className="flex items-center justify-between mb-2">
                <span className="uppercase tracking-widest">stats</span>
                <span className="text-[0.5rem]">5% taxe</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mb-2">
                <span>~52% <span className="text-[var(--text)]">&lt;2x</span></span>
                <span>~11% <span className="text-green-400">&gt;10x</span></span>
                <span>~79% <span className="text-[var(--text)]">&lt;5x</span></span>
                <span>~2% <span className="text-green-400">&gt;50x</span></span>
              </div>
              <div className="text-[0.5rem] opacity-60">
                1% legendary (50-100x) · 2% epic (15-50x)
              </div>
            </div>
          </div>
        </div>
      </main>
    </BalanceProvider>
  );
}
