"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { placeCrashBet, getUserCrashHistory } from "@/actions/crash";
import { useBalance } from "@/hooks/use-balance";

interface CrashBetPanelProps {
  gameState: "waiting" | "starting" | "running" | "crashed";
  userBet?: {
    bet: number;
    cashedOut: boolean;
    profit?: number;
    cashOutMultiplier?: number;
    autoCashout?: number;
  };
  currentMultiplier: number;
  userBalance: string;
  onCashOut: () => Promise<{ success: boolean; multiplier?: number; profit?: number; newBalance?: number; error?: string }>;
}

interface BetHistoryEntry {
  crashPoint: number;
  bet: number;
  cashOutAt: number | null;
  profit: number;
  createdAt: Date;
}

export function CrashBetPanel({
  gameState,
  userBet,
  currentMultiplier,
  userBalance,
  onCashOut,
}: CrashBetPanelProps) {
  const [betAmount, setBetAmount] = useState("1");
  const [autoCashoutAt, setAutoCashoutAt] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [betHistory, setBetHistory] = useState<BetHistoryEntry[]>([]);
  const { setBalance } = useBalance(userBalance);
  const autoCashoutTriggered = useRef(false);

  // Load bet history on mount and after each game
  useEffect(() => {
    const loadHistory = async () => {
      const history = await getUserCrashHistory();
      setBetHistory(history);
    };
    loadHistory();
  }, [gameState]);

  // Auto-cashout logic
  useEffect(() => {
    if (
      gameState === "running" &&
      userBet &&
      !userBet.cashedOut &&
      autoCashoutAt &&
      !autoCashoutTriggered.current
    ) {
      const target = parseFloat(autoCashoutAt);
      if (!isNaN(target) && target > 1 && currentMultiplier >= target) {
        autoCashoutTriggered.current = true;
        onCashOut().then((result) => {
          if (result.success) {
            setSuccess(`auto x${result.multiplier?.toFixed(2)} (+${result.profit?.toFixed(2)})`);
            if (result.newBalance !== undefined) {
              setBalance(result.newBalance.toFixed(2));
            }
          }
        });
      }
    }
  }, [gameState, userBet, currentMultiplier, autoCashoutAt, setBalance, onCashOut]);

  // Reset auto-cashout trigger when game ends
  useEffect(() => {
    if (gameState === "waiting" || gameState === "crashed") {
      autoCashoutTriggered.current = false;
    }
  }, [gameState]);

  // Clear messages when game state changes
  useEffect(() => {
    if (gameState === "waiting") {
      setError(null);
      setSuccess(null);
    }
  }, [gameState]);

  const handleBet = () => {
    setError(null);
    setSuccess(null);
    
    const amount = parseFloat(betAmount);
    if (isNaN(amount) || amount <= 0) {
      setError("montant invalide");
      return;
    }

    startTransition(async () => {
      const result = await placeCrashBet(amount);
      if (result.success) {
        setSuccess("ok");
        const newBalance = parseFloat(userBalance) - amount;
        setBalance(newBalance.toFixed(2));
      } else {
        setError(result.error || "erreur");
      }
    });
  };

  const handleCashOut = () => {
    if (!userBet || isPending) return;
    
    // Optimistic update - show success immediately
    const estimatedProfit = (userBet.bet * currentMultiplier * 0.95) - userBet.bet;
    setSuccess(`x${currentMultiplier.toFixed(2)} (+${estimatedProfit.toFixed(2)})`);
    
    // Update balance optimistically
    const estimatedWin = userBet.bet + estimatedProfit;
    const newBalance = parseFloat(userBalance) + estimatedWin;
    setBalance(newBalance.toFixed(2));
    
    // Fire and forget - server will confirm
    startTransition(async () => {
      const result = await onCashOut();
      if (!result.success) {
        // Rollback on error
        setError(result.error || "erreur cashout");
        setSuccess(null);
        setBalance(userBalance); // Reset to original
      }
      // On success, the next poll will sync the real values
    });
  };

  const potentialWin = userBet && !userBet.cashedOut 
    ? (userBet.bet * currentMultiplier * 0.95).toFixed(2)
    : null;

  const quickBets = [0.5, 1, 2, 5, 10];

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Messages */}
      {error && (
        <div className="p-2 text-xs text-red-400 border border-red-400/30 text-center">
          {error}
        </div>
      )}
      {success && (
        <div className="p-2 text-xs text-green-400 border border-green-400/30 text-center">
          {success}
        </div>
      )}

      {/* Si pas de bet en cours */}
      {!userBet && gameState === "waiting" && (
        <>
          {/* Input mise */}
          <div className="flex flex-col gap-2">
            <label className="text-[0.65rem] uppercase tracking-widest text-[var(--text-muted)]">
              mise
            </label>
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              className="w-full px-3 py-2 bg-transparent border border-[var(--line)] text-sm font-mono
                focus:outline-none focus:border-[var(--text-muted)] text-[var(--text)]"
              placeholder="1.00"
            />
          </div>

          {/* Quick bets */}
          <div className="flex gap-1">
            {quickBets.map((amount) => (
              <button
                key={amount}
                onClick={() => setBetAmount(amount.toString())}
                className="flex-1 py-1.5 text-xs border border-[var(--line)] 
                  hover:border-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.02)] 
                  transition-colors text-[var(--text-muted)]"
              >
                {amount}
              </button>
            ))}
          </div>

          {/* Auto cashout */}
          <div className="flex flex-col gap-2">
            <label className="text-[0.65rem] uppercase tracking-widest text-[var(--text-muted)]">
              auto cashout
            </label>
            <input
              type="number"
              min="1.1"
              step="0.1"
              value={autoCashoutAt}
              onChange={(e) => setAutoCashoutAt(e.target.value)}
              className="w-full px-3 py-2 bg-transparent border border-[var(--line)] text-sm font-mono
                focus:outline-none focus:border-[var(--text-muted)] text-[var(--text)]"
              placeholder="x2.0"
            />
          </div>

          {/* Bet button */}
          <button
            onClick={handleBet}
            disabled={isPending || gameState !== "waiting"}
            className="w-full py-4 text-sm border border-[var(--text)] 
              hover:bg-[rgba(255,255,255,0.05)] transition-colors
              disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-widest"
          >
            {isPending ? "..." : "parier"}
          </button>
        </>
      )}

      {/* Si bet placé mais partie pas commencée */}
      {userBet && !userBet.cashedOut && gameState === "waiting" && (
        <div className="text-center py-6">
          <p className="text-[0.65rem] uppercase tracking-widest text-[var(--text-muted)]">mise</p>
          <p className="text-xl font-mono mt-1">{userBet.bet}</p>
          {autoCashoutAt && (
            <p className="text-xs text-[var(--text-muted)] mt-2">
              auto @ x{parseFloat(autoCashoutAt).toFixed(2)}
            </p>
          )}
        </div>
      )}

      {/* Si bet en cours - bouton cashout */}
      {userBet && !userBet.cashedOut && gameState === "running" && (
        <div className="flex flex-col gap-3">
          <div className="text-center">
            <p className="text-[0.65rem] uppercase tracking-widest text-[var(--text-muted)]">gain</p>
            <p className="text-2xl font-mono mt-1">{potentialWin}</p>
          </div>
          
          <button
            onClick={handleCashOut}
            disabled={isPending}
            className="w-full py-6 text-sm border-2 border-[var(--text)] 
              hover:bg-[var(--text)] hover:text-[var(--bg)] transition-colors
              disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-widest font-medium"
          >
            {isPending ? "..." : "cashout"}
          </button>
        </div>
      )}

      {/* Si cashedout */}
      {userBet?.cashedOut && (
        <div className="text-center py-6">
          <p className="text-[0.65rem] uppercase tracking-widest text-[var(--text-muted)]">cashout</p>
          <p className="text-xl font-mono mt-1">
            x{userBet.cashOutMultiplier?.toFixed(2)}
          </p>
          <p className="text-sm font-mono mt-1 text-[var(--text-muted)]">
            +{userBet.profit?.toFixed(2)}
          </p>
        </div>
      )}

      {/* Si crashed sans cashout */}
      {userBet && !userBet.cashedOut && gameState === "crashed" && (
        <div className="text-center py-6">
          <p className="text-[0.65rem] uppercase tracking-widest text-[var(--text-muted)]">perdu</p>
          <p className="text-xl font-mono mt-1">-{userBet.bet}</p>
        </div>
      )}

      {/* Paris fermés */}
      {!userBet && gameState === "running" && (
        <div className="text-center py-6 text-[var(--text-muted)]">
          <p className="text-[0.65rem] uppercase tracking-widest">paris fermes</p>
        </div>
      )}

      {/* Affichage après crash si pas de bet */}
      {!userBet && gameState === "crashed" && (
        <div className="text-center py-6 text-[var(--text-muted)]">
          <p className="text-xs">nouvelle partie...</p>
        </div>
      )}

      {/* User bet history */}
      {betHistory.length > 0 && (
        <div className="border-t border-[var(--line)] mt-2">
          <div className="py-2 border-b border-[var(--line)]">
            <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)]">historique</p>
          </div>
          <div className="divide-y divide-[var(--line)] max-h-40 overflow-y-auto">
            {betHistory.map((entry, i) => {
              const won = entry.profit > 0;
              const lost = entry.profit < 0;
              return (
                <div
                  key={i}
                  className={`px-3 py-2 flex items-center justify-between ${
                    won ? "bg-green-500/5" : lost ? "bg-red-500/5" : "bg-yellow-500/5"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--text-muted)] font-mono">{entry.bet}e</span>
                    <span className="text-[var(--text-muted)]">→</span>
                    <span className={`text-xs font-mono ${
                      entry.cashOutAt ? "text-green-400" : "text-red-400"
                    }`}>
                      x{(entry.cashOutAt || entry.crashPoint).toFixed(2)}
                    </span>
                  </div>
                  <span className={`text-xs font-mono ${
                    won ? "text-green-400" : lost ? "text-red-400" : "text-yellow-400"
                  }`}>
                    {entry.profit > 0 ? "+" : ""}{entry.profit.toFixed(2)}e
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
