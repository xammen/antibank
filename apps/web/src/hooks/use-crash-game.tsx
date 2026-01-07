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

  // Animation du multiplicateur local (60fps)
  useEffect(() => {
    // Arrêter l'animation si pas en running
    if (gameState?.state !== "running") {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      
      // Définir le multiplicateur selon l'état
      if (gameState?.state === "crashed" && gameState.crashPoint) {
        setLocalMultiplier(gameState.crashPoint);
      } else {
        setLocalMultiplier(1.0);
      }
      return;
    }

    // En mode running - animer le multiplicateur
    const startTime = gameState.startTime;
    
    if (!startTime) {
      // Pas encore de startTime du serveur - utiliser le multiplicateur du serveur
      setLocalMultiplier(gameState.currentMultiplier);
      return;
    }

    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const mult = calculateMultiplier(Math.max(0, elapsed));
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
  }, [gameState?.state, gameState?.startTime, gameState?.crashPoint, gameState?.currentMultiplier]);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/crash", { cache: "no-store" });
      if (!res.ok) {
        setIsConnected(false);
        return;
      }
      
      const data: CrashGameState = await res.json();
      setGameState(data);
      setIsConnected(true);
    } catch {
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    // Fetch initial
    fetchState();

    // Polling toutes les 500ms
    pollingRef.current = setInterval(fetchState, 500);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [fetchState]);

  const placeBet = useCallback(async (amount: number) => {
    const result = await placeCrashBet(amount);
    // No await fetchState - polling will sync, UI updates optimistically in CrashBetPanel
    return result;
  }, []);

  const cashOut = useCallback(async () => {
    const result = await cashOutCrash(localMultiplier);
    // No await fetchState - polling will sync, UI updates optimistically in CrashBetPanel
    return result;
  }, [localMultiplier]);

  const voteSkip = useCallback(async () => {
    const result = await voteSkipCrash();
    // No await fetchState - polling will sync
    return result;
  }, []);

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
