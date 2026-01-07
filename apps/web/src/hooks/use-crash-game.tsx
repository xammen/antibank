"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { placeCrashBet, cashOutCrash, voteSkipCrash } from "@/actions/crash";
import { calculateMultiplier } from "@/lib/crash";

interface CrashPlayer {
  odrzerId: string;
  odrzerame: string;
  bet: number;
  cashedOut: boolean;
  cashOutMultiplier?: number;
  profit?: number;
}

interface CrashHistoryEntry {
  id: string;
  crashPoint: number;
  createdAt: Date;
}

interface CrashGameState {
  id: string;
  state: "waiting" | "running" | "crashed";
  crashPoint?: number;
  currentMultiplier: number;
  countdown: number;
  startTime?: number | null;
  players: CrashPlayer[];
  skipVotes: number;
  skipVotesNeeded: number;
  history: CrashHistoryEntry[];
}

interface UseCrashGameReturn {
  gameState: CrashGameState | null;
  isConnected: boolean;
  userBet?: CrashPlayer;
  placeBet: (amount: number) => Promise<{ success: boolean; error?: string }>;
  cashOut: () => Promise<{ success: boolean; multiplier?: number; profit?: number }>;
  voteSkip: () => Promise<{ success: boolean; skipped?: boolean }>;
  localMultiplier: number;
}

export function useCrashGame(userId?: string): UseCrashGameReturn {
  const [gameState, setGameState] = useState<CrashGameState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [localMultiplier, setLocalMultiplier] = useState(1.0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastStateRef = useRef<string | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Local multiplier animation (60fps)
  useEffect(() => {
    if (gameState?.state !== "running") {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      setLocalMultiplier(gameState?.currentMultiplier || 1.0);
      return;
    }

    // Synchroniser le startTime
    if (gameState.startTime) {
      startTimeRef.current = gameState.startTime;
    }

    const animate = () => {
      if (startTimeRef.current && gameState?.state === "running") {
        const elapsed = Date.now() - startTimeRef.current;
        const mult = calculateMultiplier(elapsed);
        setLocalMultiplier(mult);
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [gameState?.state, gameState?.startTime, gameState?.currentMultiplier]);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/crash", { cache: "no-store" });
      if (res.ok) {
        const data: CrashGameState = await res.json();
        
        // Détecter changement d'état pour sync
        if (lastStateRef.current !== data.state) {
          lastStateRef.current = data.state;
          
          if (data.state === "running" && data.startTime) {
            startTimeRef.current = data.startTime;
          } else if (data.state !== "running") {
            startTimeRef.current = null;
          }
        }
        
        setGameState(data);
        setIsConnected(true);
      }
    } catch {
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchState();

    // Polling adaptatif
    const startPolling = () => {
      // Poll toutes les 500ms pour l'état (le multiplier est calculé localement)
      pollingRef.current = setInterval(fetchState, 500);
    };

    startPolling();

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchState]);

  const placeBet = useCallback(async (amount: number) => {
    const result = await placeCrashBet(amount);
    if (result.success) {
      fetchState();
    }
    return result;
  }, [fetchState]);

  const cashOut = useCallback(async () => {
    const result = await cashOutCrash();
    if (result.success) {
      fetchState();
    }
    return result;
  }, [fetchState]);

  const voteSkip = useCallback(async () => {
    const result = await voteSkipCrash();
    if (result.success) {
      fetchState();
    }
    return result;
  }, [fetchState]);

  const userBet = userId 
    ? gameState?.players.find((p) => p.odrzerId === userId)
    : undefined;

  return {
    gameState,
    isConnected,
    userBet,
    placeBet,
    cashOut,
    voteSkip,
    localMultiplier,
  };
}
