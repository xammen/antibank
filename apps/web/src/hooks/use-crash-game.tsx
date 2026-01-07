"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { placeCrashBet, cashOutCrash } from "@/actions/crash";

interface CrashPlayer {
  odrzerId: string;
  odrzerame: string;
  bet: number;
  cashedOut: boolean;
  cashOutMultiplier?: number;
  profit?: number;
}

interface CrashGameState {
  id: string;
  state: "waiting" | "running" | "crashed";
  crashPoint?: number;
  currentMultiplier: number;
  countdown: number;
  startTime?: number | null;
  players: CrashPlayer[];
}

interface UseCrashGameReturn {
  gameState: CrashGameState | null;
  isConnected: boolean;
  userBet?: CrashPlayer;
  placeBet: (amount: number) => Promise<{ success: boolean; error?: string }>;
  cashOut: () => Promise<{ success: boolean; multiplier?: number; profit?: number }>;
}

export function useCrashGame(userId?: string): UseCrashGameReturn {
  const [gameState, setGameState] = useState<CrashGameState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const stateRef = useRef<string | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/crash", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setGameState(data);
        stateRef.current = data.state;
        setIsConnected(true);
      }
    } catch {
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchState();

    // Start polling
    const startPolling = () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      
      // Poll every 100ms during running for smooth multiplier updates
      // Poll every 500ms during waiting/crashed
      const getInterval = () => stateRef.current === "running" ? 100 : 500;
      
      pollingRef.current = setInterval(() => {
        fetchState();
      }, getInterval());
    };

    startPolling();

    // Adjust polling rate when state changes
    const adjustInterval = setInterval(() => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        const interval = stateRef.current === "running" ? 100 : 500;
        pollingRef.current = setInterval(fetchState, interval);
      }
    }, 1000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      clearInterval(adjustInterval);
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

  const userBet = userId 
    ? gameState?.players.find((p) => p.odrzerId === userId)
    : undefined;

  return {
    gameState,
    isConnected,
    userBet,
    placeBet,
    cashOut,
  };
}
