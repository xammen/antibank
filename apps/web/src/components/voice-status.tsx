"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useBalance } from "@/hooks/use-balance";
import { formatMinutes } from "@/lib/voice-bonus";

interface VoiceStatusData {
  inVoice: boolean;
  channelName?: string;
  othersCount?: number;
  
  // Session
  sessionSeconds?: number;
  joinedAt?: string;
  
  // Gains
  earningsPerMin?: string;
  sessionMultiplier?: number;
  isHappyHour?: boolean;
  
  // Daily
  dailyVoiceMinutes?: number;
  dailyBonus?: number;
  nextTier?: { minutes: number; bonus: number; label: string };
  
  // Streak
  voiceStreak?: number;
  streakBonus?: number;
  
  // Total
  totalVoiceMinutes?: number;
}

export function VoiceStatus() {
  const [status, setStatus] = useState<VoiceStatusData | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [blink, setBlink] = useState(true);
  const [countdown, setCountdown] = useState(60);
  const [flash, setFlash] = useState(false);
  const { refreshBalance } = useBalance("0");
  const lastMinute = useRef<number>(-1);

  // Fetch status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/voice-status");
      const data = await res.json();
      setStatus(data);
      // Petit délai pour que la transition soit visible
      setTimeout(() => setIsLoaded(true), 50);
    } catch {
      setStatus({ inVoice: false });
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Blink effect
  useEffect(() => {
    if (!status?.inVoice) return;
    const blinkInterval = setInterval(() => setBlink(prev => !prev), 1000);
    return () => clearInterval(blinkInterval);
  }, [status?.inVoice]);

  // Countdown timer - sync avec les minutes + refresh balance
  useEffect(() => {
    if (!status?.inVoice) return;

    const updateCountdown = () => {
      const now = new Date();
      const currentMinute = now.getMinutes();
      const secondsUntilNextMinute = 60 - now.getSeconds();
      
      setCountdown(secondsUntilNextMinute);
      
      // Nouvelle minute = refresh le solde
      if (lastMinute.current !== -1 && lastMinute.current !== currentMinute) {
        refreshBalance();
        setFlash(true);
        setTimeout(() => setFlash(false), 500);
      }
      lastMinute.current = currentMinute;
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [status?.inVoice, refreshBalance]);

  // Rien à afficher
  if (!status || (!status.inVoice && !status.dailyVoiceMinutes && !status.voiceStreak)) {
    return null;
  }

  const multiplierText = status.sessionMultiplier && status.sessionMultiplier > 1 
    ? `x${status.sessionMultiplier.toFixed(1)}` 
    : null;

  // Calcul progression
  const progressPercent = status.nextTier 
    ? Math.min(100, ((status.dailyVoiceMinutes || 0) / status.nextTier.minutes) * 100)
    : 0;

  // Mode inactif
  if (!status.inVoice) {
    return (
      <div className={`
        flex flex-col gap-2 p-3 border border-[var(--line)] bg-[rgba(255,255,255,0.01)]
        transition-all duration-500 ease-out
        ${isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}
      `}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]/30" />
            <span className="text-[0.7rem]">vocal</span>
          </div>
          {(status.dailyVoiceMinutes || 0) > 0 && (
            <span className="text-[0.7rem] text-[var(--text-muted)]">
              {formatMinutes(status.dailyVoiceMinutes || 0)} aujourd'hui
              {(status.dailyBonus || 0) > 0 && (
                <span className="text-green-400 ml-1">+{status.dailyBonus?.toFixed(0)}€</span>
              )}
            </span>
          )}
        </div>
        
        {(status.voiceStreak || 0) >= 2 && (
          <div className="text-[0.65rem] text-orange-400">
            🔥 {status.voiceStreak}j streak
          </div>
        )}
      </div>
    );
  }

  // Mode actif - design compact
  return (
    <div className={`
      flex flex-col gap-2 p-3 border bg-[rgba(34,197,94,0.03)]
      transition-all duration-500 ease-out
      ${isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}
      ${flash 
        ? "border-green-400 bg-[rgba(34,197,94,0.12)] shadow-[0_0_15px_rgba(34,197,94,0.2)]" 
        : "border-green-500/20"
      }
    `}>
      {/* Ligne principale */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`
            w-1.5 h-1.5 rounded-full bg-green-500 
            transition-opacity duration-300
            ${blink ? "opacity-100" : "opacity-30"}
          `} />
          <span className="text-[0.7rem] text-green-400">
            +{status.earningsPerMin}€/min
            {multiplierText && <span className="text-yellow-400 ml-1">{multiplierText}</span>}
            {status.isHappyHour && <span className="text-purple-400 ml-1">🌙</span>}
          </span>
        </div>
        
        {/* Countdown */}
        <div className="flex items-center gap-1.5">
          <span className={`
            text-[0.9rem] font-light tabular-nums transition-all duration-200
            ${flash ? "text-white" : "text-green-400"}
          `}>
            {countdown}s
          </span>
        </div>
      </div>

      {/* Progress bar + bonus */}
      {status.nextTier && (
        <div className="flex flex-col gap-1">
          <div className="h-1 bg-[rgba(255,255,255,0.08)] rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-500/70 rounded-full transition-all duration-700"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[0.6rem] text-[var(--text-muted)]">
            <span>{formatMinutes(status.dailyVoiceMinutes || 0)}</span>
            <span>
              {status.nextTier.label} → <span className="text-green-400">+{status.nextTier.bonus.toFixed(0)}€</span>
            </span>
          </div>
        </div>
      )}

      {/* Streak (si applicable) */}
      {(status.voiceStreak || 0) >= 2 && (
        <div className="text-[0.6rem] text-orange-400">
          🔥 {status.voiceStreak}j streak
        </div>
      )}
    </div>
  );
}
