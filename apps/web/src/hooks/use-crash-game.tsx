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
  const startTimeRef = useRef<number | null>(null);
  const lastGameIdRef = useRef<string | null>(null);
  const lastStateRef = useRef<string | null>(null);

  // Local multiplier animation (60fps)
  useEffect(() => {
    // Stop animation if not running
    if (gameState?.state !== "running") {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      
      // Set multiplier based on state
      if (gameState?.state === "crashed" && gameState.crashPoint) {
        setLocalMultiplier(gameState.crashPoint);
      } else {
        setLocalMultiplier(1.0);
      }
      return;
    }

    // Synchronize startTime when game starts
    if (gameState.startTime && startTimeRef.current !== gameState.startTime) {
      startTimeRef.current = gameState.startTime;
    }
    
    // Fallback: si pas de startTime du serveur, utiliser maintenant
    // (le serveur synchronisera au prochain poll)
    if (!startTimeRef.current) {
      startTimeRef.current = Date.now();
    }

    const animate = () => {
      const elapsed = Date.now() - (startTimeRef.current || Date.now());
      const mult = calculateMultiplier(elapsed);
      setLocalMultiplier(mult);
      
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [gameState?.state, gameState?.startTime, gameState?.crashPoint]);

  // Reset startTime when game changes
  useEffect(() => {
    if (gameState && gameState.id !== lastGameIdRef.current) {
      lastGameIdRef.current = gameState.id;
      startTimeRef.current = null;
      setLocalMultiplier(1.0);
    }
  }, [gameState?.id]);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/crash", { cache: "no-store" });
      if (!res.ok) {
        setIsConnected(false);
        return;
      }
      
      const data: CrashGameState = await res.json();
      
      // Detect state transitions for proper sync
      const stateChanged = lastStateRef.current !== data.state;
      lastStateRef.current = data.state;
      
      if (stateChanged) {
        if (data.state === "running" && data.startTime) {
          // Game just started, sync startTime
          startTimeRef.current = data.startTime;
        } else if (data.state === "waiting") {
          // New game, reset
          startTimeRef.current = null;
          setLocalMultiplier(1.0);
        } else if (data.state === "crashed" && data.crashPoint) {
          // Game crashed, set final multiplier
          setLocalMultiplier(data.crashPoint);
        }
      }
      
      setGameState(data);
      setIsConnected(true);
    } catch {
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchState();

    // Adaptive polling:
    // - 500ms during running (to detect crash quickly)
    // - 1000ms during waiting/crashed (less urgent)
    const poll = () => {
      fetchState();
    };

    pollingRef.current = setInterval(poll, 500);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [fetchState]);

  const placeBet = useCallback(async (amount: number) => {
    const result = await placeCrashBet(amount);
    if (result.success) {
      // Immediately refresh state
      await fetchState();
    }
    return result;
  }, [fetchState]);

  const cashOut = useCallback(async () => {
    // Envoyer le multiplicateur local pour un timing précis
    const result = await cashOutCrash(localMultiplier);
    if (result.success) {
      // Immediately refresh state
      await fetchState();
    }
    return result;
  }, [fetchState, localMultiplier]);

  const voteSkip = useCallback(async () => {
    const result = await voteSkipCrash();
    if (result.success) {
      await fetchState();
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
