"use client";

import { useBalance } from "@/hooks/use-balance";
import { useMemo } from "react";

interface BalanceProps {
  initialBalance: string;
}

export function Balance({ initialBalance }: BalanceProps) {
  const { displayBalance, intensity } = useBalance(initialBalance);

  // Shake style based on intensity
  const shakeStyle = useMemo(() => {
    if (intensity < 0.1) return {};
    
    const magnitude = intensity * 3; // max 3px shake
    const rotation = intensity * 1; // max 1deg rotation
    
    return {
      animation: intensity > 0.3 ? `shake ${0.1 - intensity * 0.05}s infinite` : 'none',
      transform: `translate(${(Math.random() - 0.5) * magnitude}px, ${(Math.random() - 0.5) * magnitude}px) rotate(${(Math.random() - 0.5) * rotation}deg)`,
    };
  }, [intensity]);

  // Color based on intensity
  const textColor = useMemo(() => {
    if (intensity > 0.7) return "text-green-400";
    if (intensity > 0.4) return "text-green-200";
    return "text-[var(--text)]";
  }, [intensity]);

  return (
    <div className="flex flex-col items-center justify-center p-6 border-y border-[var(--line)] w-full bg-[rgba(255,255,255,0.02)]">
      <p className="text-[0.7rem] text-[var(--text-muted)] mb-2 uppercase tracking-widest">solde</p>
      <div 
        className={`text-[2.5rem] font-light leading-none tracking-tight transition-colors duration-100 ${textColor}`}
        style={shakeStyle}
      >
        <span className="tabular-nums">{displayBalance.toFixed(2)}</span>
        <span className="text-[var(--text-muted)] text-[1.2rem] ml-1">€</span>
      </div>
    </div>
  );
}
