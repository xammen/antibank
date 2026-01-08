"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getRoomState,
  checkAndStartGame,
  type GameRoomPublic,
} from "@/actions/game-room";

/**
 * Unified Game Room Hook
 * 
 * Single source of truth - polls getRoomState() only
 * Server decides ALL state transitions
 * Client displays based on room.status + serverTime offset
 */

const POLL_INTERVAL_MS = 1000; // Unified 1s polling

interface UseGameRoomOptions {
  roomId: string;
  onRoomDeleted?: () => void;
}

interface UseGameRoomReturn {
  room: GameRoomPublic | null;
  loading: boolean;
  error: string | null;
  serverTimeOffset: number; // Client clock - server clock (ms)
  getServerTime: () => number; // Get current server time
}

export function useGameRoom({
  roomId,
  onRoomDeleted,
}: UseGameRoomOptions): UseGameRoomReturn {
  const [room, setRoom] = useState<GameRoomPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverTimeOffset, setServerTimeOffset] = useState(0);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastStatusRef = useRef<string | null>(null);

  /**
   * Get current server time based on offset
   */
  const getServerTime = useCallback(() => {
    return Date.now() - serverTimeOffset;
  }, [serverTimeOffset]);

  /**
   * Poll room state from server
   */
  const pollRoomState = useCallback(async () => {
    try {
      const res = await getRoomState(roomId);
      
      if (!res.success || !res.room) {
        // Room deleted or error
        setRoom(null);
        setError(res.error || "room supprimée");
        setLoading(false);
        onRoomDeleted?.();
        return;
      }

      // Calculate server time offset (for countdown sync)
      const clientTime = Date.now();
      const offset = clientTime - res.room.serverTime;
      setServerTimeOffset(offset);

      setRoom(res.room);
      setError(null);
      setLoading(false);

      // Detect status changes and trigger server transitions if needed
      const prevStatus = lastStatusRef.current;
      const newStatus = res.room.status;

      if (prevStatus !== newStatus) {
        lastStatusRef.current = newStatus;

        // If countdown just started or is ongoing, check if it should end
        if (newStatus === "countdown" && res.room.countdownEnd) {
          const serverNow = getServerTime();
          const countdownEnd = new Date(res.room.countdownEnd).getTime();
          const timeUntilEnd = countdownEnd - serverNow;

          // If countdown should be done, trigger server transition
          if (timeUntilEnd <= 0) {
            checkAndStartGame(roomId).catch(() => {
              // Ignore errors - server is source of truth
            });
          }
        }
      }
    } catch (err) {
      console.error("Poll error:", err);
      setError("erreur de connexion");
    }
  }, [roomId, onRoomDeleted, getServerTime]);

  /**
   * Start polling
   */
  useEffect(() => {
    // Initial poll
    pollRoomState();

    // Set up interval
    pollIntervalRef.current = setInterval(pollRoomState, POLL_INTERVAL_MS);

    // Cleanup
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [pollRoomState]);

  /**
   * Auto-trigger game start when countdown ends
   */
  useEffect(() => {
    if (!room || room.status !== "countdown" || !room.countdownEnd) return;

    const serverNow = getServerTime();
    const countdownEnd = new Date(room.countdownEnd).getTime();
    const timeUntilEnd = countdownEnd - serverNow;

    if (timeUntilEnd <= 0) {
      // Already ended, trigger now
      checkAndStartGame(roomId).catch(() => {});
      return;
    }

    // Schedule trigger when countdown ends
    const timeoutId = setTimeout(() => {
      checkAndStartGame(roomId).catch(() => {});
    }, timeUntilEnd);

    return () => clearTimeout(timeoutId);
  }, [room, roomId, getServerTime]);

  return {
    room,
    loading,
    error,
    serverTimeOffset,
    getServerTime,
  };
}
