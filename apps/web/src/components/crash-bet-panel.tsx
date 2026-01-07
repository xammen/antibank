"use client";

import { useState, useEffect, useRef } from "react";
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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [betHistory, setBetHistory] = useState<BetHistoryEntry[]>([]);
  const { setBalance } = useBalance(userBalance);
  const autoCashoutTriggered = useRef(false);
  const lastGameStateRef = useRef(gameState);
  
  // État optimiste local - override l'état serveur temporairement
  const [optimisticBet, setOptimisticBet] = useState<{ bet: number } | null>(null);
  const [optimisticCashout, setOptimisticCashout] = useState<{ multiplier: number; profit: number } | null>(null);
  
  // Reset optimistic state quand le serveur confirme ou quand le jeu change
  useEffect(() => {
    if (userBet) {
      setOptimisticBet(null); // Serveur a confirmé le bet
    }
    if (userBet?.cashedOut) {
      setOptimisticCashout(null); // Serveur a confirmé le cashout
    }
  }, [userBet]);
  
  // Reset tout à la nouvelle partie
  useEffect(() => {
    if (gameState === "waiting" && lastGameStateRef.current === "crashed") {
      setOptimisticBet(null);
      setOptimisticCashout(null);
    }
  }, [gameState]);
  
  // Calculer l'état effectif (optimiste ou serveur)
  const effectiveBet = optimisticBet || userBet;
  const effectiveCashedOut = optimisticCashout || (userBet?.cashedOut ? { 
    multiplier: userBet.cashOutMultiplier || 0, 
    profit: userBet.profit || 0 
  } : null);

  // Load bet history on mount and when game crashes (not on every state change)
  useEffect(() => {
    // Only load when transitioning TO crashed state
    if (gameState === "crashed" && lastGameStateRef.current !== "crashed") {
      getUserCrashHistory().then(setBetHistory);
    }
    lastGameStateRef.current = gameState;
  }, [gameState]);
  
  // Initial load
  useEffect(() => {
    getUserCrashHistory().then(setBetHistory);
  }, []);

  // Auto-cashout logic
  useEffect(() => {
    if (
      gameState === "running" &&
      effectiveBet &&
      !effectiveCashedOut &&
      autoCashoutAt &&
      !autoCashoutTriggered.current
    ) {
      const target = parseFloat(autoCashoutAt);
      if (!isNaN(target) && target > 1 && currentMultiplier >= target) {
        autoCashoutTriggered.current = true;
        // Utiliser handleCashOut qui fait l'update optimiste
        handleCashOut();
      }
    }
  }, [gameState, effectiveBet, effectiveCashedOut, currentMultiplier, autoCashoutAt]);

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
    
    if (amount > parseFloat(userBalance)) {
      setError("solde insuffisant");
      return;
    }

    // INSTANT: UI optimiste - affiche immédiatement comme si bet placé
    setOptimisticBet({ bet: amount });
    const newBalance = parseFloat(userBalance) - amount;
    setBalance(newBalance.toFixed(2));
    
    // Fire and forget - serveur confirme en background
    placeCrashBet(amount).then(result => {
      if (!result.success) {
        setError(result.error || "erreur");
        setOptimisticBet(null); // Rollback UI
        setBalance(userBalance);
      }
    });
  };

  const handleCashOut = () => {
    const bet = effectiveBet;
    if (!bet) return;
    
    // INSTANT: Calcul et affichage immédiat
    const betAmount = bet.bet;
    const multiplier = currentMultiplier;
    const profit = Math.floor((betAmount * multiplier * 0.95 - betAmount) * 100) / 100;
    
    // UI optimiste - affiche immédiatement comme si cashout réussi
    setOptimisticCashout({ multiplier, profit });
    const newBalance = parseFloat(userBalance) + betAmount + profit;
    setBalance(newBalance.toFixed(2));
    
    // Fire and forget - serveur confirme en background
    onCashOut().then(result => {
      if (!result.success) {
        setError(result.error || "erreur cashout");
        setOptimisticCashout(null); // Rollback UI
        setBalance(userBalance);
      }
    });
  };

  const potentialWin = effectiveBet && !effectiveCashedOut 
    ? (effectiveBet.bet * currentMultiplier * 0.95).toFixed(2)
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
      {!effectiveBet && gameState === "waiting" && (
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
            disabled={gameState !== "waiting"}
            className="w-full py-4 text-sm border border-[var(--text)] 
              hover:bg-[rgba(255,255,255,0.05)] transition-colors
              disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-widest"
          >
            parier
          </button>
        </>
      )}

      {/* Si bet placé mais partie pas commencée */}
      {effectiveBet && !effectiveCashedOut && gameState === "waiting" && (
        <div className="text-center py-6">
          <p className="text-[0.65rem] uppercase tracking-widest text-[var(--text-muted)]">mise</p>
          <p className="text-xl font-mono mt-1">{effectiveBet.bet}</p>
          {autoCashoutAt && (
            <p className="text-xs text-[var(--text-muted)] mt-2">
              auto @ x{parseFloat(autoCashoutAt).toFixed(2)}
            </p>
          )}
        </div>
      )}

      {/* Si bet en cours - bouton cashout */}
      {effectiveBet && !effectiveCashedOut && gameState === "running" && (
        <div className="flex flex-col gap-3">
          <div className="text-center">
            <p className="text-[0.65rem] uppercase tracking-widest text-[var(--text-muted)]">gain</p>
            <p className="text-2xl font-mono mt-1">{potentialWin}</p>
          </div>
          
          <button
            onClick={handleCashOut}
            className="w-full py-6 text-sm border-2 border-[var(--text)] 
              hover:bg-[var(--text)] hover:text-[var(--bg)] transition-colors
              uppercase tracking-widest font-medium active:scale-95 transition-transform"
          >
            cashout
          </button>
        </div>
      )}

      {/* Si cashedout */}
      {effectiveCashedOut && (
        <div className="text-center py-6">
          <p className="text-[0.65rem] uppercase tracking-widest text-[var(--text-muted)]">cashout</p>
          <p className="text-xl font-mono mt-1">
            x{effectiveCashedOut.multiplier.toFixed(2)}
          </p>
          <p className="text-sm font-mono mt-1 text-[var(--text-muted)]">
            +{effectiveCashedOut.profit.toFixed(2)}
          </p>
        </div>
      )}

      {/* Si crashed sans cashout */}
      {effectiveBet && !effectiveCashedOut && gameState === "crashed" && (
        <div className="text-center py-6">
          <p className="text-[0.65rem] uppercase tracking-widest text-[var(--text-muted)]">perdu</p>
          <p className="text-xl font-mono mt-1">-{effectiveBet.bet}</p>
        </div>
      )}

      {/* Paris fermés */}
      {!effectiveBet && gameState === "running" && (
        <div className="text-center py-6 text-[var(--text-muted)]">
          <p className="text-[0.65rem] uppercase tracking-widest">paris fermes</p>
        </div>
      )}

      {/* Affichage après crash si pas de bet */}
      {!effectiveBet && gameState === "crashed" && (
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
