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
  const { gameState, isConnected, userBet, placeBet, cashOut } = useCrashGame(userId, userName);

  if (!gameState) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-[var(--text-muted)]">
          chargement...
        </div>
      </main>
    );
  }

  return (
    <BalanceProvider initialBalance={userBalance}>
      <main className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between p-4 border-b border-[var(--line)]">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-sm"
            >
              &larr; retour
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
              multiplier={gameState.currentMultiplier}
              crashPoint={gameState.crashPoint}
              countdown={gameState.countdown}
              startTime={gameState.startTime}
            />
          </div>

          {/* Side panel */}
          <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-[var(--line)] flex flex-col">
            {/* Balance */}
            <div className="p-4 border-b border-[var(--line)]">
              <Balance initialBalance={userBalance} />
            </div>

            {/* Bet panel */}
            <div className="flex-1 overflow-auto">
              <CrashBetPanel
                gameState={gameState.state}
                userBet={userBet}
                currentMultiplier={gameState.currentMultiplier}
                userBalance={userBalance}
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
                    key={player.userId}
                    className={`flex items-center justify-between text-xs p-2 border border-[var(--line)] ${
                      player.cashedOut 
                        ? "bg-green-500/10 border-green-500/30" 
                        : gameState.state === "crashed" 
                          ? "bg-red-500/10 border-red-500/30"
                          : ""
                    }`}
                  >
                    <span className="truncate max-w-[100px]">
                      {player.username.toLowerCase()}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--text-muted)]">{player.bet}€</span>
                      {player.cashedOut && (
                        <span className="text-green-400">
                          x{player.cashOutMultiplier?.toFixed(2)}
                        </span>
                      )}
                      {!player.cashedOut && gameState.state === "crashed" && (
                        <span className="text-red-400">💥</span>
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
