"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { placeCrashBet, cashOutCrash } from "@/actions/crash";
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
}

export function CrashBetPanel({
  gameState,
  userBet,
  currentMultiplier,
  userBalance,
}: CrashBetPanelProps) {
  const [betAmount, setBetAmount] = useState("1");
  const [autoCashoutAt, setAutoCashoutAt] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { setBalance } = useBalance(userBalance);
  const autoCashoutTriggered = useRef(false);

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
        // Trigger cashout
        cashOutCrash().then((result) => {
          if (result.success) {
            setSuccess(`auto-cashout x${result.multiplier?.toFixed(2)} (+${result.profit?.toFixed(2)}€)`);
            if (result.newBalance !== undefined) {
              setBalance(result.newBalance.toFixed(2));
            }
          }
        });
      }
    }
  }, [gameState, userBet, currentMultiplier, autoCashoutAt, setBalance]);

  // Reset auto-cashout trigger when game ends
  useEffect(() => {
    if (gameState === "waiting" || gameState === "crashed") {
      autoCashoutTriggered.current = false;
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
        setSuccess("pari placé!");
        // Update balance locally
        const newBalance = parseFloat(userBalance) - amount;
        setBalance(newBalance.toFixed(2));
      } else {
        setError(result.error || "erreur");
      }
    });
  };

  const handleCashOut = () => {
    if (!userBet) return;
    
    startTransition(async () => {
      const result = await cashOutCrash();
      if (result.success) {
        setSuccess(`cashout x${result.multiplier?.toFixed(2)} (+${result.profit?.toFixed(2)}€)`);
        if (result.newBalance !== undefined) {
          setBalance(result.newBalance.toFixed(2));
        }
      } else {
        setError(result.error || "erreur");
      }
    });
  };

  const potentialWin = userBet && !userBet.cashedOut 
    ? (userBet.bet * currentMultiplier * 0.95).toFixed(2)
    : null;

  const quickBets = [0.5, 1, 2, 5, 10];

  return (
    <div className="flex flex-col gap-4 p-4 border border-[var(--line)] bg-[rgba(255,255,255,0.02)]">
      {/* Messages */}
      {error && (
        <div className="p-2 text-sm text-red-400 border border-red-500/30 bg-red-500/10 text-center">
          {error}
        </div>
      )}
      {success && (
        <div className="p-2 text-sm text-green-400 border border-green-500/30 bg-green-500/10 text-center">
          {success}
        </div>
      )}

      {/* Si pas de bet en cours */}
      {!userBet && gameState === "waiting" && (
        <>
          {/* Input mise */}
          <div className="flex flex-col gap-2">
            <label className="text-[0.7rem] uppercase tracking-widest text-[var(--text-muted)]">
              mise (€)
            </label>
            <Input
              type="number"
              min="0.5"
              step="0.5"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              className="bg-[var(--bg)] border-[var(--line)] text-[var(--text)] font-mono"
              placeholder="1.00"
            />
          </div>

          {/* Quick bets */}
          <div className="flex gap-2">
            {quickBets.map((amount) => (
              <button
                key={amount}
                onClick={() => setBetAmount(amount.toString())}
                className="flex-1 py-1.5 text-xs border border-[var(--line)] hover:border-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.03)] transition-all"
              >
                {amount}€
              </button>
            ))}
          </div>

          {/* Bet button */}
          <Button
            onClick={handleBet}
            disabled={isPending || gameState !== "waiting"}
            className="w-full py-6 text-lg bg-green-600 hover:bg-green-500 text-white font-medium"
          >
            {isPending ? "..." : "parier"}
          </Button>
        </>
      )}

      {/* Si bet placé mais partie pas commencée */}
      {userBet && !userBet.cashedOut && gameState === "waiting" && (
        <div className="text-center py-8">
          <p className="text-sm text-[var(--text-muted)]">pari placé</p>
          <p className="text-2xl font-mono mt-2">{userBet.bet}€</p>
          <p className="text-xs text-[var(--text-muted)] mt-2">en attente...</p>
        </div>
      )}

      {/* Si bet en cours - bouton cashout */}
      {userBet && !userBet.cashedOut && gameState === "running" && (
        <div className="flex flex-col gap-4">
          <div className="text-center">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest">gain potentiel</p>
            <p 
              className="text-3xl font-mono mt-1 text-green-400"
              style={{
                textShadow: "0 0 10px rgba(34, 197, 94, 0.5)",
              }}
            >
              {potentialWin}€
            </p>
          </div>
          
          <Button
            onClick={handleCashOut}
            disabled={isPending}
            className="w-full py-8 text-xl bg-green-500 hover:bg-green-400 text-white font-bold animate-pulse"
          >
            {isPending ? "..." : `CASHOUT ${potentialWin}€`}
          </Button>
        </div>
      )}

      {/* Si cashedout */}
      {userBet?.cashedOut && (
        <div className="text-center py-8">
          <p className="text-sm text-green-400 uppercase tracking-widest">cashout réussi!</p>
          <p className="text-3xl font-mono mt-2 text-green-400">
            x{userBet.cashOutMultiplier?.toFixed(2)}
          </p>
          <p className="text-lg font-mono mt-1">
            +{userBet.profit?.toFixed(2)}€
          </p>
        </div>
      )}

      {/* Si crashed sans cashout */}
      {userBet && !userBet.cashedOut && gameState === "crashed" && (
        <div className="text-center py-8">
          <p className="text-sm text-red-400 uppercase tracking-widest">perdu</p>
          <p className="text-3xl font-mono mt-2 text-red-400">
            -{userBet.bet}€
          </p>
        </div>
      )}

      {/* Paris fermés */}
      {!userBet && gameState === "running" && (
        <div className="text-center py-8 text-[var(--text-muted)]">
          <p className="text-sm uppercase tracking-widest">paris fermés</p>
          <p className="text-xs mt-2">attends la prochaine partie</p>
        </div>
      )}

      {/* Affichage après crash si pas de bet */}
      {!userBet && gameState === "crashed" && (
        <div className="text-center py-8 text-[var(--text-muted)]">
          <p className="text-sm">prochaine partie dans quelques secondes...</p>
        </div>
      )}
    </div>
  );
}
