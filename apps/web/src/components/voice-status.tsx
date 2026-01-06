"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useBalance } from "@/hooks/use-balance";
import { formatDuration, formatMinutes } from "@/lib/voice-bonus";

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
  const [status, setStatus] = useState<VoiceStatusData>({ inVoice: false });
  const [blink, setBlink] = useState(true);
  const [countdown, setCountdown] = useState(60);
  const [flash, setFlash] = useState(false);
  const [sessionTime, setSessionTime] = useState(0);
  const { refreshBalance } = useBalance("0");
  const lastMinute = useRef<number>(-1);
  const sessionStart = useRef<Date | null>(null);

  // Fetch status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/voice-status");
      const data = await res.json();
      setStatus(data);
      
      if (data.inVoice && data.joinedAt) {
        sessionStart.current = new Date(data.joinedAt);
      } else {
        sessionStart.current = null;
      }
    } catch {
      setStatus({ inVoice: false });
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Poll toutes les 30 sec
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Update session timer every second
  useEffect(() => {
    if (!status.inVoice || !sessionStart.current) return;
    
    const updateTimer = () => {
      if (sessionStart.current) {
        const seconds = Math.floor((Date.now() - sessionStart.current.getTime()) / 1000);
        setSessionTime(seconds);
      }
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [status.inVoice]);

  // Blink effect
  useEffect(() => {
    if (!status.inVoice) return;
    
    const blinkInterval = setInterval(() => {
      setBlink(prev => !prev);
    }, 1000);

    return () => clearInterval(blinkInterval);
  }, [status.inVoice]);

  // Countdown timer - sync avec les minutes + refresh balance
  useEffect(() => {
    if (!status.inVoice) return;

    const updateCountdown = () => {
      const now = new Date();
      const currentMinute = now.getMinutes();
      const secondsUntilNextMinute = 60 - now.getSeconds();
      
      setCountdown(secondsUntilNextMinute);
      
      // Nouvelle minute = refresh le solde
      if (lastMinute.current !== -1 && lastMinute.current !== currentMinute) {
        refreshBalance();
        // Flash effect
        setFlash(true);
        setTimeout(() => setFlash(false), 500);
      }
      lastMinute.current = currentMinute;
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [status.inVoice, refreshBalance]);

  // Afficher les stats même si pas en vocal (si on a des données)
  if (!status.inVoice && !status.dailyVoiceMinutes && !status.voiceStreak) {
    return null;
  }

  // Mode "pas en vocal mais stats dispo"
  if (!status.inVoice) {
    if (!status.dailyVoiceMinutes && !status.voiceStreak) return null;
    
    return (
      <div className="flex flex-col gap-2 p-4 border border-[var(--line)] bg-[rgba(255,255,255,0.01)]">
        <div className="flex items-center gap-2 text-[var(--text-muted)]">
          <span className="w-2 h-2 rounded-full bg-[var(--text-muted)]/30" />
          <span className="text-[0.75rem]">vocal inactif</span>
        </div>
        
        {/* Stats du jour */}
        {(status.dailyVoiceMinutes || 0) > 0 && (
          <div className="flex items-center justify-between text-[0.7rem]">
            <span className="text-[var(--text-muted)]">
              aujourd'hui: {formatMinutes(status.dailyVoiceMinutes || 0)}
            </span>
            {(status.dailyBonus || 0) > 0 && (
              <span className="text-green-400">+{status.dailyBonus?.toFixed(2)}€ bonus</span>
            )}
          </div>
        )}
        
        {/* Streak */}
        {(status.voiceStreak || 0) >= 2 && (
          <div className="flex items-center gap-1 text-[0.7rem] text-orange-400">
            <span>🔥</span>
            <span>{status.voiceStreak} jours</span>
            {(status.streakBonus || 0) > 0 && (
              <span className="text-[var(--text-muted)]">(+{status.streakBonus?.toFixed(2)}€)</span>
            )}
          </div>
        )}
      </div>
    );
  }

  const sessionMinutes = Math.floor(sessionTime / 60);
  const multiplierText = status.sessionMultiplier && status.sessionMultiplier > 1 
    ? `x${status.sessionMultiplier.toFixed(2)}` 
    : null;

  return (
    <div className={`
      flex flex-col gap-3 p-4 border bg-[rgba(34,197,94,0.05)]
      transition-all duration-300
      ${flash 
        ? "border-green-400 bg-[rgba(34,197,94,0.15)] shadow-[0_0_20px_rgba(34,197,94,0.3)]" 
        : "border-green-500/30"
      }
    `}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span 
            className={`
              w-2 h-2 rounded-full bg-green-500 
              transition-opacity duration-300
              ${blink ? "opacity-100" : "opacity-40"}
            `}
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.75rem] text-green-400">
              mining vocal
              {status.channelName && (
                <span className="text-[var(--text-muted)]"> • {status.channelName}</span>
              )}
            </span>
            <span className="text-[0.7rem] text-[var(--text-muted)]">
              +{status.earningsPerMin}€/min
              {multiplierText && (
                <span className="text-yellow-400 ml-1">({multiplierText})</span>
              )}
              {status.isHappyHour && (
                <span className="text-purple-400 ml-1">🌙 happy hour!</span>
              )}
              {status.othersCount && status.othersCount > 1 && (
                <span> • {status.othersCount} personnes</span>
              )}
            </span>
          </div>
        </div>
        
        {/* Countdown */}
        <div className="flex flex-col items-end">
          <span className={`
            text-[1.1rem] font-light tabular-nums transition-all duration-300
            ${flash ? "text-white scale-110" : "text-green-400"}
          `}>
            {countdown}s
          </span>
          <span className="text-[0.6rem] text-[var(--text-muted)]">
            {flash ? `+${status.earningsPerMin}€!` : "prochain gain"}
          </span>
        </div>
      </div>

      {/* Session timer + Daily stats */}
      <div className="flex items-center justify-between pt-2 border-t border-green-500/20">
        {/* Session actuelle */}
        <div className="flex flex-col">
          <span className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)]">
            session
          </span>
          <span className="text-[0.9rem] font-mono text-[var(--text)]">
            ⏱️ {formatDuration(sessionTime)}
          </span>
        </div>

        {/* Stats aujourd'hui */}
        <div className="flex flex-col items-end">
          <span className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)]">
            aujourd'hui
          </span>
          <span className="text-[0.8rem] text-[var(--text)]">
            📊 {formatMinutes((status.dailyVoiceMinutes || 0))}
            {(status.dailyBonus || 0) > 0 && (
              <span className="text-green-400 ml-1">(+{status.dailyBonus?.toFixed(2)}€)</span>
            )}
          </span>
        </div>
      </div>

      {/* Prochain palier + Streak */}
      <div className="flex items-center justify-between text-[0.65rem]">
        {/* Prochain palier */}
        {status.nextTier && (
          <div className="text-[var(--text-muted)]">
            prochain bonus: {status.nextTier.label} → +{status.nextTier.bonus.toFixed(2)}€
          </div>
        )}

        {/* Streak */}
        {(status.voiceStreak || 0) >= 2 && (
          <div className="flex items-center gap-1 text-orange-400">
            <span>🔥</span>
            <span>{status.voiceStreak}j streak</span>
            {(status.streakBonus || 0) > 0 && (
              <span className="text-[var(--text-muted)]">(+{status.streakBonus?.toFixed(2)}€)</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
