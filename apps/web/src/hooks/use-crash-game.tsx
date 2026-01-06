"use client";

import { useState, useEffect } from "react";
import usePartySocket from "partysocket/react";

interface CrashPlayer {
  userId: string;
  username: string;
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
  placeBet: (amount: number) => void;
  cashOut: () => void;
}

export function useCrashGame(userId?: string, username?: string): UseCrashGameReturn {
  const [gameState, setGameState] = useState<CrashGameState | null>(null);

  const socket = usePartySocket({
    host: process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999",
    room: "crash-game",
    onMessage(event) {
      try {
        const data = JSON.parse(event.data);
        setGameState(data);
      } catch (error) {
        console.error("[CrashGame] Parse error:", error);
      }
    },
    onError(error) {
      console.error("[CrashGame] WebSocket error:", error);
    },
  });

  const placeBet = (amount: number) => {
    if (!userId || !username) {
      console.error("[CrashGame] Missing userId or username");
      return;
    }
    socket.send(JSON.stringify({ 
      type: "BET", 
      userId, 
      username, 
      amount 
    }));
  };

  const cashOut = () => {
    if (!userId) {
      console.error("[CrashGame] Missing userId");
      return;
    }
    socket.send(JSON.stringify({ 
      type: "CASHOUT", 
      userId 
    }));
  };

  const userBet = userId 
    ? gameState?.players.find((p) => p.userId === userId)
    : undefined;

  return {
    gameState,
    isConnected: socket.readyState === WebSocket.OPEN,
    userBet,
    placeBet,
    cashOut,
  };
}
