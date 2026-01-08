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

// Couleur dynamique pour le bouton cashout basée sur le multiplicateur
function getCashoutButtonColor(mult: number): { bg: string; shadow: string; text: string } {
  if (mult < 2) {
    return { bg: "#22c55e", shadow: "0 0 20px rgba(34, 197, 94, 0.4)", text: "#000" };
  } else if (mult < 5) {
    return { bg: "#eab308", shadow: "0 0 20px rgba(234, 179, 8, 0.4)", text: "#000" };
  } else if (mult < 10) {
    return { bg: "#f97316", shadow: "0 0 25px rgba(249, 115, 22, 0.5)", text: "#000" };
  } else if (mult < 25) {
    return { bg: "#ef4444", shadow: "0 0 30px rgba(239, 68, 68, 0.5)", text: "#fff" };
  } else {
    return { bg: "#a855f7", shadow: "0 0 35px rgba(168, 85, 247, 0.6)", text: "#fff" };
  }
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
  
  // Loading states pour feedback immédiat
  const [isBetting, setIsBetting] = useState(false);
  const [isCashingOut, setIsCashingOut] = useState(false);
  
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
    if (isBetting) return; // Prevent double-click
    
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

    // INSTANT feedback
    setIsBetting(true);
    
    // UI optimiste - affiche immédiatement comme si bet placé
    setOptimisticBet({ bet: amount });
    const newBalance = parseFloat(userBalance) - amount;
    setBalance(newBalance.toFixed(2));
    
    // Fire and forget - serveur confirme en background
    placeCrashBet(amount).then(result => {
      setIsBetting(false);
      if (!result.success) {
        setError(result.error || "erreur");
        setOptimisticBet(null); // Rollback UI
        setBalance(userBalance);
      }
    });
  };

  const handleCashOut = () => {
    if (isCashingOut) return; // Prevent double-click
    
    const bet = effectiveBet;
    if (!bet) return;
    
    // INSTANT feedback
    setIsCashingOut(true);
    
    // Calcul et affichage immédiat
    const betAmount = bet.bet;
    const multiplier = currentMultiplier;
    const profit = Math.floor((betAmount * multiplier * 0.95 - betAmount) * 100) / 100;
    
    // UI optimiste - affiche immédiatement comme si cashout réussi
    setOptimisticCashout({ multiplier, profit });
    const newBalance = parseFloat(userBalance) + betAmount + profit;
    setBalance(newBalance.toFixed(2));
    
    // Fire and forget - serveur confirme en background
    onCashOut().then(result => {
      setIsCashingOut(false);
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

          {/* Bet button - Premium design */}
          <button
            onClick={handleBet}
            disabled={gameState !== "waiting" || isBetting}
            className={`
              w-full py-4 text-sm uppercase tracking-widest font-medium
              border border-[var(--text)] bg-[rgba(255,255,255,0.03)]
              transition-all duration-150 ease-out
              hover:bg-[rgba(255,255,255,0.08)] hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]
              active:scale-[0.98] active:bg-[rgba(255,255,255,0.12)]
              disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:active:scale-100
              ${isBetting ? "animate-pulse" : ""}
            `}
          >
            {isBetting ? "..." : "parier"}
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

      {/* Si bet en cours - bouton cashout PREMIUM */}
      {effectiveBet && !effectiveCashedOut && gameState === "running" && (
        <div className="flex flex-col gap-3">
          <div className="text-center">
            <p className="text-[0.65rem] uppercase tracking-widest text-[var(--text-muted)]">gain potentiel</p>
            <p className="text-3xl font-mono mt-1 font-light">{potentialWin}€</p>
          </div>
          
          {/* Cashout button - Pulsating, colored based on multiplier */}
          <button
            onClick={handleCashOut}
            disabled={isCashingOut}
            className={`
              w-full py-8 text-base uppercase tracking-widest font-bold
              transition-all duration-100 ease-out
              active:scale-[0.97]
              disabled:opacity-70 disabled:cursor-not-allowed
              ${isCashingOut ? "" : "animate-[pulse-cashout_0.8s_ease-in-out_infinite]"}
            `}
            style={{
              backgroundColor: getCashoutButtonColor(currentMultiplier).bg,
              color: getCashoutButtonColor(currentMultiplier).text,
              boxShadow: getCashoutButtonColor(currentMultiplier).shadow,
            }}
          >
            {isCashingOut ? "..." : `cashout ${currentMultiplier.toFixed(2)}x`}
          </button>
          
          {/* Heartbeat indicator - faster as multiplier increases */}
          <div 
            className="h-1 bg-[var(--line)] overflow-hidden rounded-full"
          >
            <div 
              className="h-full rounded-full transition-all duration-100"
              style={{
                backgroundColor: getCashoutButtonColor(currentMultiplier).bg,
                width: `${Math.min(100, (currentMultiplier / 10) * 100)}%`,
                animation: `heartbeat ${Math.max(0.3, 1 - currentMultiplier / 20)}s ease-in-out infinite`,
              }}
            />
          </div>
        </div>
      )}

      {/* Si cashedout - Celebration */}
      {effectiveCashedOut && (
        <div className="text-center py-6 animate-celebrate">
          <p className="text-[0.65rem] uppercase tracking-widest text-green-400/70">cashout réussi</p>
          <p className="text-3xl font-mono mt-2 text-green-400 font-light">
            {effectiveCashedOut.multiplier.toFixed(2)}x
          </p>
          <p className="text-lg font-mono mt-1 text-green-400">
            +{effectiveCashedOut.profit.toFixed(2)}€
          </p>
        </div>
      )}

      {/* Si crashed sans cashout - Loss */}
      {effectiveBet && !effectiveCashedOut && gameState === "crashed" && (
        <div className="text-center py-6 animate-loss">
          <p className="text-[0.65rem] uppercase tracking-widest text-red-400/70">perdu</p>
          <p className="text-2xl font-mono mt-2 text-red-400">-{effectiveBet.bet}€</p>
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

    </div>
  );
}
