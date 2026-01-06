"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { clickBatch } from "@/actions/click";
import { useBalance } from "@/hooks/use-balance";

interface ClickerProps {
  userId: string;
  clickValue?: number; // valeur par clic (avec upgrades)
}

interface FloatingNumber {
  id: number;
  x: number;
  y: number;
}

let floatId = 0;

export function Clicker({ userId, clickValue = 0.01 }: ClickerProps) {
  const [clickEffect, setClickEffect] = useState(false);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [floats, setFloats] = useState<FloatingNumber[]>([]);
  const [clicksRemaining, setClicksRemaining] = useState<number>(1000);
  const { addToBalance, setBalance } = useBalance("0");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const errorTimeout = useRef<NodeJS.Timeout | null>(null);
  
  // Batching state
  const pendingClicks = useRef<number>(0);
  const batchTimeout = useRef<NodeJS.Timeout | null>(null);
  const isSyncing = useRef<boolean>(false);

  // Fetch initial clicks remaining
  useEffect(() => {
    fetch("/api/clicks-remaining")
      .then(res => res.json())
      .then(data => setClicksRemaining(data.remaining))
      .catch(() => {});
  }, []);

  // Sync pending clicks with server
  const syncClicks = useCallback(async () => {
    if (pendingClicks.current === 0 || isSyncing.current) return;
    
    isSyncing.current = true;
    const clicksToSync = pendingClicks.current;
    pendingClicks.current = 0;
    
    try {
      const result = await clickBatch(userId, clicksToSync);
      
      if (result.success) {
        setError(null);
        if (result.clicksRemaining !== undefined) {
          setClicksRemaining(result.clicksRemaining);
        }
        // Sync avec le vrai solde serveur
        if (result.newBalance !== undefined) {
          setBalance(result.newBalance.toFixed(2));
        }
      } else {
        setError(result.error || "erreur");
        if (result.clicksRemaining !== undefined) {
          setClicksRemaining(result.clicksRemaining);
        }
        if (errorTimeout.current) clearTimeout(errorTimeout.current);
        errorTimeout.current = setTimeout(() => setError(null), 2000);
      }
    } catch {
      setError("erreur reseau");
      errorTimeout.current = setTimeout(() => setError(null), 2000);
    } finally {
      isSyncing.current = false;
      // Si d'autres clics ont été faits pendant le sync, relance
      if (pendingClicks.current > 0) {
        syncClicks();
      }
    }
  }, [userId, setBalance]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    // Check limite locale
    if (clicksRemaining <= 0) {
      setError("limite atteinte");
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Ripple effect
    const rippleId = floatId++;
    setRipples(prev => [...prev, { id: rippleId, x, y }]);
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== rippleId));
    }, 500);
    
    // Floating +0.01 - spawn au-dessus du bouton avec spread
    const floatX = (Math.random() - 0.5) * 80;
    const floatY = -20 + (Math.random() - 0.5) * 20;
    const id = floatId++;
    setFloats(prev => [...prev, { id, x: floatX, y: floatY }]);
    setTimeout(() => {
      setFloats(prev => prev.filter(f => f.id !== id));
    }, 700);
    
    // Effet visuel immédiat
    setClickEffect(true);
    setTimeout(() => setClickEffect(false), 80);
    
    // Clear error
    if (errorTimeout.current) clearTimeout(errorTimeout.current);
    setError(null);
    
    // OPTIMISTIC UI: ajoute immédiatement au solde local
    addToBalance(clickValue);
    setClicksRemaining(prev => Math.max(0, prev - 1));
    
    // Accumule le clic
    pendingClicks.current += 1;
    
    // Debounce: sync après 300ms d'inactivité
    if (batchTimeout.current) clearTimeout(batchTimeout.current);
    batchTimeout.current = setTimeout(() => {
      syncClicks();
    }, 300);
    
  }, [clickValue, clicksRemaining, addToBalance, syncClicks]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (batchTimeout.current) clearTimeout(batchTimeout.current);
      if (errorTimeout.current) clearTimeout(errorTimeout.current);
    };
  }, []);

  // Sync avant de quitter la page
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pendingClicks.current > 0) {
        // Fire and forget
        navigator.sendBeacon?.(
          `/api/click-sync?userId=${userId}&count=${pendingClicks.current}`
        );
      }
    };
    
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [userId]);

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="relative">
        {/* Floating +value */}
        <div className="absolute inset-0 pointer-events-none overflow-visible" style={{ zIndex: 100 }}>
          {floats.map((float) => (
            <span
              key={float.id}
              className="absolute left-1/2 top-0 whitespace-nowrap
                         text-[1rem] font-medium text-green-400 
                         animate-float-up"
              style={{
                marginLeft: float.x,
                marginTop: float.y,
                textShadow: "0 0 10px rgba(74,222,128,0.8), 0 0 20px rgba(74,222,128,0.4)",
              }}
            >
              +{clickValue.toFixed(2)}
            </span>
          ))}
        </div>
        
        {/* Outer glow on click */}
        <div 
          className={`
            absolute -inset-2 rounded-full transition-all duration-200
            ${clickEffect 
              ? "bg-gradient-to-r from-green-500/20 to-emerald-500/20 blur-xl opacity-100" 
              : "opacity-0"
            }
          `} 
        />
        
        {/* Button */}
        <button
          ref={buttonRef}
          onClick={handleClick}
          disabled={clicksRemaining <= 0}
          className={`
            relative z-10 overflow-hidden
            w-32 h-32 rounded-full 
            border-2 
            flex items-center justify-center
            text-[3rem] font-light select-none
            bg-[var(--bg)]
            transition-all duration-100 ease-out
            hover:border-[var(--text-muted)] hover:text-[var(--text)]
            active:scale-[0.95]
            disabled:opacity-50 disabled:cursor-not-allowed
            ${clickEffect 
              ? "scale-[0.93] border-green-500/70 text-white shadow-[0_0_20px_rgba(74,222,128,0.3)]" 
              : "border-[var(--line)] text-[var(--text-muted)]"
            }
          `}
        >
          {/* Ripple effects */}
          {ripples.map((ripple) => (
            <span
              key={ripple.id}
              className="absolute rounded-full bg-white/30 animate-ripple"
              style={{
                left: ripple.x,
                top: ripple.y,
                transform: "translate(-50%, -50%)",
              }}
            />
          ))}
          <span className="relative z-10">$</span>
        </button>
      </div>

      {/* Clics restants */}
      <div className="text-center">
        <span className="text-[0.7rem] text-[var(--text-muted)]">
          {clicksRemaining > 0 ? (
            <><span className="text-[var(--text)] tabular-nums">{clicksRemaining}</span> clics restants</>
          ) : (
            <span className="text-red-400">limite atteinte</span>
          )}
        </span>
      </div>

      {/* Error */}
      <div className="h-4 text-center">
        {error && (
          <p className="text-[0.75rem] text-red-400">{error}</p>
        )}
      </div>
    </div>
  );
}
