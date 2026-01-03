"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { click } from "@/actions/click";
import { useBalance } from "@/hooks/use-balance";

interface ClickerProps {
  userId: string;
}

interface FloatingNumber {
  id: number;
  x: number;
  y: number;
}

let floatId = 0;

export function Clicker({ userId }: ClickerProps) {
  const [clickEffect, setClickEffect] = useState(false);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [floats, setFloats] = useState<FloatingNumber[]>([]);
  const [clicksRemaining, setClicksRemaining] = useState<number>(1000);
  const { addToBalance } = useBalance("0");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const errorTimeout = useRef<NodeJS.Timeout | null>(null);

  // Fetch initial clicks remaining
  useEffect(() => {
    fetch("/api/clicks-remaining")
      .then(res => res.json())
      .then(data => setClicksRemaining(data.remaining))
      .catch(() => {});
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Ripple effect
    const rippleId = floatId++;
    setRipples(prev => [...prev, { id: rippleId, x, y }]);
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== rippleId));
    }, 500);
    
    // Floating +0.01€ - spawn au-dessus du bouton avec spread
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
    
    // Envoie le clic au serveur (non-bloquant)
    click(userId).then((result) => {
      if (result.success) {
        addToBalance(0.01);
        setError(null);
        if (result.clicksRemaining !== undefined) {
          setClicksRemaining(result.clicksRemaining);
        }
      } else {
        setError(result.error || "erreur");
        if (result.clicksRemaining !== undefined) {
          setClicksRemaining(result.clicksRemaining);
        }
        errorTimeout.current = setTimeout(() => setError(null), 2000);
      }
    });
  }, [userId, addToBalance]);

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="relative">
        {/* Floating +0.01€ */}
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
              +0.01€
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
          <span className="relative z-10">€</span>
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
