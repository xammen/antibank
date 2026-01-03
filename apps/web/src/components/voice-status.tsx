"use client";

import { useState, useEffect, useRef } from "react";
import { useBalance } from "@/hooks/use-balance";

interface VoiceStatusData {
  inVoice: boolean;
  channelName?: string;
  othersCount?: number;
  earningsPerMin?: string;
}

export function VoiceStatus() {
  const [status, setStatus] = useState<VoiceStatusData>({ inVoice: false });
  const [blink, setBlink] = useState(true);
  const [countdown, setCountdown] = useState(60);
  const [flash, setFlash] = useState(false);
  const { refreshBalance } = useBalance("0");
  const lastMinute = useRef<number>(-1);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/voice-status");
        const data = await res.json();
        setStatus(data);
      } catch {
        setStatus({ inVoice: false });
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);

    return () => clearInterval(interval);
  }, []);

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

  if (!status.inVoice) {
    return null;
  }

  return (
    <div className={`
      flex items-center justify-between px-4 py-3 border bg-[rgba(34,197,94,0.05)]
      transition-all duration-300
      ${flash 
        ? "border-green-400 bg-[rgba(34,197,94,0.15)] shadow-[0_0_20px_rgba(34,197,94,0.3)]" 
        : "border-green-500/30"
      }
    `}>
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
          {flash ? "+0.05€!" : "prochain gain"}
        </span>
      </div>
    </div>
  );
}
