"use client";

import { useState, useEffect, useRef } from "react";
import { placeCrashBet } from "@/actions/crash";
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

// Slider component réutilisable
function Slider({
  value,
  onChange,
  min,
  max,
  step,
  label,
  formatValue,
  quickValues,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  label: string;
  formatValue: (v: number) => string;
  quickValues?: { value: number; label: string }[];
}) {
  const percentage = ((value - min) / (max - min)) * 100;
  
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-[0.65rem] uppercase tracking-widest text-[var(--text-muted)]">
          {label}
        </label>
        <span className="text-sm font-mono text-[var(--text)]">
          {formatValue(value)}
        </span>
      </div>
      
      {/* Slider track */}
      <div className="relative h-8 flex items-center">
        <div className="absolute inset-x-0 h-1.5 bg-[var(--line)] rounded-full">
          <div 
            className="h-full bg-[var(--text)] rounded-full transition-all duration-100"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-x-0 w-full h-8 opacity-0 cursor-pointer"
        />
        {/* Thumb indicator */}
        <div 
          className="absolute w-4 h-4 bg-[var(--text)] rounded-full shadow-[0_0_10px_rgba(255,255,255,0.3)] pointer-events-none transition-all duration-100"
          style={{ left: `calc(${percentage}% - 8px)` }}
        />
      </div>
      
      {/* Quick values */}
      {quickValues && (
        <div className="flex gap-1">
          {quickValues.map((qv) => (
            <button
              key={qv.value}
              onClick={() => onChange(qv.value)}
              className={`flex-1 py-1.5 text-xs border transition-colors ${
                value === qv.value 
                  ? "border-[var(--text)] bg-[rgba(255,255,255,0.05)]" 
                  : "border-[var(--line)] text-[var(--text-muted)] hover:border-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.02)]"
              }`}
            >
              {qv.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Probabilité de crash avant un multiplicateur donné
function getCrashProbability(multiplier: number): number {
  // P(crash before x) = 1 - 1/x (pour x >= 1)
  if (multiplier <= 1) return 0;
  return 1 - (1 / multiplier);
}

export function CrashBetPanel({
  gameState,
  userBet,
  currentMultiplier,
  userBalance,
  onCashOut,
}: CrashBetPanelProps) {
  const [betAmount, setBetAmount] = useState(1);
  const [autoCashoutAt, setAutoCashoutAt] = useState(2);
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  // Track game state transitions
  useEffect(() => {
    lastGameStateRef.current = gameState;
  }, [gameState]);

  // Auto-cashout logic
  useEffect(() => {
    if (
      gameState === "running" &&
      effectiveBet &&
      !effectiveCashedOut &&
      autoCashoutEnabled &&
      autoCashoutAt > 1 &&
      !autoCashoutTriggered.current
    ) {
      if (currentMultiplier >= autoCashoutAt) {
        autoCashoutTriggered.current = true;
        // Utiliser handleCashOut qui fait l'update optimiste
        handleCashOut();
      }
    }
  }, [gameState, effectiveBet, effectiveCashedOut, currentMultiplier, autoCashoutAt, autoCashoutEnabled]);

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
    }
  }, [gameState]);

  const maxBet = Math.min(10000, parseFloat(userBalance));

  const handleBet = () => {
    if (isBetting) return; // Prevent double-click
    
    setError(null);
    
    if (betAmount <= 0) {
      setError("montant invalide");
      return;
    }
    
    if (betAmount > parseFloat(userBalance)) {
      setError("solde insuffisant");
      return;
    }

    // INSTANT feedback
    setIsBetting(true);
    
    // UI optimiste - affiche immédiatement comme si bet placé
    setOptimisticBet({ bet: betAmount });
    const newBalance = parseFloat(userBalance) - betAmount;
    setBalance(newBalance.toFixed(2));
    
    // Fire and forget - serveur confirme en background
    placeCrashBet(betAmount).then(result => {
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
    const betAmt = bet.bet;
    const multiplier = currentMultiplier;
    const profit = Math.floor((betAmt * multiplier * 0.95 - betAmt) * 100) / 100;
    
    // UI optimiste - affiche immédiatement comme si cashout réussi
    setOptimisticCashout({ multiplier, profit });
    const newBalance = parseFloat(userBalance) + betAmt + profit;
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

  // Probabilités pour l'affichage
  const crashProbBefore = getCrashProbability(autoCashoutAt);
  const survivalProb = 1 - crashProbBefore;

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Error message */}
      {error && (
        <div className="p-2 text-xs text-red-400 border border-red-400/30 text-center animate-loss">
          {error}
        </div>
      )}

      {/* Si pas de bet en cours */}
      {!effectiveBet && gameState === "waiting" && (
        <>
          {/* Slider mise */}
          <Slider
            value={betAmount}
            onChange={setBetAmount}
            min={0.5}
            max={maxBet}
            step={0.5}
            label="mise"
            formatValue={(v) => `${v.toFixed(2)}€`}
            quickValues={[
              { value: 0.5, label: "0.5" },
              { value: 1, label: "1" },
              { value: 2, label: "2" },
              { value: 5, label: "5" },
              { value: 10, label: "10" },
            ]}
          />

          {/* Auto cashout toggle + slider */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-[0.65rem] uppercase tracking-widest text-[var(--text-muted)]">
                auto cashout
              </label>
              <button
                onClick={() => setAutoCashoutEnabled(!autoCashoutEnabled)}
                className={`w-10 h-5 rounded-full transition-colors relative ${
                  autoCashoutEnabled ? "bg-[var(--text)]" : "bg-[var(--line)]"
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                    autoCashoutEnabled 
                      ? "left-5 bg-[var(--bg)]" 
                      : "left-0.5 bg-[var(--text-muted)]"
                  }`}
                />
              </button>
            </div>
            
            {autoCashoutEnabled && (
              <>
                <Slider
                  value={autoCashoutAt}
                  onChange={setAutoCashoutAt}
                  min={1.1}
                  max={100}
                  step={0.1}
                  label=""
                  formatValue={(v) => `x${v.toFixed(2)}`}
                  quickValues={[
                    { value: 1.5, label: "1.5x" },
                    { value: 2, label: "2x" },
                    { value: 3, label: "3x" },
                    { value: 5, label: "5x" },
                    { value: 10, label: "10x" },
                  ]}
                />
                
                {/* Probabilités - bien visibles */}
                <div className="grid grid-cols-2 gap-2 p-3 border border-[var(--line)] bg-[rgba(255,255,255,0.02)]">
                  <div className="text-center">
                    <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)] mb-1">
                      chance de crash avant
                    </p>
                    <p className="text-lg font-mono text-red-400">
                      {(crashProbBefore * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)] mb-1">
                      chance de succès
                    </p>
                    <p className="text-lg font-mono text-green-400">
                      {(survivalProb * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="col-span-2 text-center pt-2 border-t border-[var(--line)]">
                    <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)] mb-1">
                      gain espéré (si succès)
                    </p>
                    <p className="text-lg font-mono text-[var(--text)]">
                      {(betAmount * autoCashoutAt * 0.95).toFixed(2)}€
                      <span className="text-[var(--text-muted)] text-xs ml-1">
                        (+{((autoCashoutAt * 0.95 - 1) * 100).toFixed(0)}%)
                      </span>
                    </p>
                  </div>
                </div>
              </>
            )}
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
            {isBetting ? "..." : `parier ${betAmount.toFixed(2)}€`}
          </button>
        </>
      )}

      {/* Si bet placé mais partie pas commencée */}
      {effectiveBet && !effectiveCashedOut && gameState === "waiting" && (
        <div className="text-center py-6">
          <p className="text-[0.65rem] uppercase tracking-widest text-[var(--text-muted)]">mise</p>
          <p className="text-xl font-mono mt-1">{effectiveBet.bet}€</p>
          {autoCashoutEnabled && autoCashoutAt > 1 && (
            <p className="text-xs text-[var(--text-muted)] mt-2">
              auto @ x{autoCashoutAt.toFixed(2)}
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
