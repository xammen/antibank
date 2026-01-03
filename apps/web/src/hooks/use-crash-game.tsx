"use client";

import { useState, useEffect, useCallback, useRef } from "react";

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
  state: "waiting" | "starting" | "running" | "crashed";
  crashPoint?: number;
  currentMultiplier: number;
  countdown: number;
  startTime?: number | null;
  players: CrashPlayer[];
}

export function useCrashGame(userId?: string) {
  const [gameState, setGameState] = useState<CrashGameState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef<CrashGameState | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/crash", { 
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        const data = await res.json();
        setGameState(data);
        stateRef.current = data;
        setIsConnected(true);
      }
    } catch (e) {
      console.error("Fetch error:", e);
      setIsConnected(false);
    }
  }, []);

  // Setup polling avec interval dynamique
  useEffect(() => {
    fetchState();

    const poll = () => {
      const state = stateRef.current?.state;
      let interval: number;
      
      if (state === "running") {
        interval = 100; // 10 fps pendant le jeu
      } else if (state === "waiting") {
        interval = 500; // 2 fps en attente
      } else {
        interval = 300; // défaut
      }

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      intervalRef.current = setInterval(() => {
        fetchState();
        poll(); // Re-évalue l'interval après chaque fetch
      }, interval);
    };

    poll();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchState]);

  const userBet = userId 
    ? gameState?.players.find((p) => p.odrzerId === userId)
    : undefined;

  return {
    gameState,
    isConnected,
    userBet,
    refetch: fetchState,
  };
}
