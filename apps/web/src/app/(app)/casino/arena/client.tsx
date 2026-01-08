"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  setReady,
  getOpenRooms,
  getRoomState,
  quickMatch,
  checkAndStartGame,
  submitPFCChoice,
  getMyActiveRoom,
  rematchRoom,
  type GameType,
  type GameRoomPublic,
} from "@/actions/game-room";
import { DiceAnimation } from "@/components/arena/dice-animation";
import { PFCAnimation } from "@/components/arena/pfc-animation";

interface ArenaClientProps {
  userId: string;
  userBalance: string;
  userName: string;
}

type View = "lobby" | "room" | "create";

const QUICK_AMOUNTS = [1, 5, 10, 25, 50, 100];

export function ArenaClient({ userId, userBalance: userBalanceStr, userName }: ArenaClientProps) {
  const userBalance = Number(userBalanceStr);
  const [view, setView] = useState<View>("lobby");
  const [gameType, setGameType] = useState<GameType>("dice");
  const [rooms, setRooms] = useState<GameRoomPublic[]>([]);
  const [currentRoom, setCurrentRoom] = useState<GameRoomPublic | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  
  // Create room form
  const [createAmount, setCreateAmount] = useState(10);
  const [createMaxPlayers, setCreateMaxPlayers] = useState(4);
  const [createPrivate, setCreatePrivate] = useState(false);
  const [createGameType, setCreateGameType] = useState<GameType>("dice");

  // PFC choice
  const [pfcChoice, setPfcChoice] = useState<"pierre" | "feuille" | "ciseaux" | null>(null);

  // Animation state
  const [showAnimation, setShowAnimation] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);

  // Load rooms and check for active room
  const loadRooms = useCallback(async () => {
    const [roomsRes, activeRes] = await Promise.all([
      getOpenRooms(gameType),
      getMyActiveRoom(),
    ]);
    
    if (roomsRes.success) {
      setRooms(roomsRes.rooms);
    }
    
    if (activeRes.success && activeRes.room) {
      setCurrentRoom(activeRes.room);
      setView("room");
    }
  }, [gameType]);

  // Poll room state when in a room
  useEffect(() => {
    if (view !== "room" || !currentRoom) return;

    const poll = async () => {
      const res = await getRoomState(currentRoom.id);
      if (res.success && res.room) {
        setCurrentRoom(res.room);
        
        // SERVER-DRIVEN: No client logic - just call checkAndStartGame to let server decide
        if (res.room.status === "countdown" && res.room.countdownEnd) {
          const serverNow = res.room.serverTime;
          const end = new Date(res.room.countdownEnd).getTime();
          const timeLeft = end - serverNow;
          
          // Only trigger if countdown is actually done (based on server time)
          if (timeLeft <= 0) {
            await checkAndStartGame(res.room.id);
          }
        }
      } else if (!res.success) {
        // Room deleted or error
        setCurrentRoom(null);
        setView("lobby");
        loadRooms();
      }
    };

    // Poll every 1000ms (unified)
    const interval = setInterval(poll, 1000);
    return () => clearInterval(interval);
  }, [view, currentRoom, loadRooms]);

  // Trigger animation when game starts (status changes to playing/finished)
  useEffect(() => {
    if (!currentRoom) return;
    
    // For dice: trigger animation when status becomes "finished" (dice are rolled server-side)
    if (currentRoom.gameType === "dice" && currentRoom.status === "finished" && !animationComplete) {
      setShowAnimation(true);
    }
    
    // For PFC: trigger animation when all players have made their choice
    if (currentRoom.gameType === "pfc" && currentRoom.status === "finished" && !animationComplete) {
      setShowAnimation(true);
    }
  }, [currentRoom, animationComplete]);

  // Reset animation state when leaving room
  const resetAnimationState = useCallback(() => {
    setShowAnimation(false);
    setAnimationComplete(false);
    setPfcChoice(null);
  }, []);

  // Initial load
  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  // Poll lobby rooms (moins fréquent car moins critique)
  useEffect(() => {
    if (view !== "lobby") return;
    
    const interval = setInterval(loadRooms, 2000);
    return () => clearInterval(interval);
  }, [view, loadRooms]);

  // Handlers
  const handleQuickMatch = async (amount: number) => {
    setLoading(true);
    setError(null);
    
    const res = await quickMatch(gameType, amount);
    
    if (res.success && res.room) {
      setCurrentRoom(res.room);
      setView("room");
    } else {
      setError(res.error || "erreur");
    }
    
    setLoading(false);
  };

  const handleJoinRoom = async (roomId: string) => {
    setLoading(true);
    setError(null);
    
    const res = await joinRoom(roomId);
    
    if (res.success && res.room) {
      setCurrentRoom(res.room);
      setView("room");
    } else {
      setError(res.error || "erreur");
    }
    
    setLoading(false);
  };

  const handleJoinByCode = async () => {
    if (!joinCode.trim()) return;
    await handleJoinRoom(joinCode.trim().toUpperCase());
  };

  const handleCreateRoom = async () => {
    setLoading(true);
    setError(null);
    
    const res = await createRoom(createGameType, createAmount, createPrivate, createMaxPlayers);
    
    if (res.success && res.room) {
      setCurrentRoom(res.room);
      setView("room");
    } else {
      setError(res.error || "erreur");
    }
    
    setLoading(false);
  };

  const handleLeaveRoom = async () => {
    if (!currentRoom) return;
    
    setLoading(true);
    const res = await leaveRoom(currentRoom.id);
    
    if (res.success) {
      setCurrentRoom(null);
      setView("lobby");
      resetAnimationState();
      loadRooms();
    } else {
      setError(res.error || "erreur");
    }
    
    setLoading(false);
  };

  const handleSetReady = async () => {
    if (!currentRoom) return;
    
    const myPlayer = currentRoom.players.find(p => p.odrzerId === userId);
    if (!myPlayer) return;
    
    await setReady(currentRoom.id, !myPlayer.isReady);
  };

  const handlePFCChoice = async (choice: "pierre" | "feuille" | "ciseaux") => {
    if (!currentRoom) return;
    
    setPfcChoice(choice);
    await submitPFCChoice(currentRoom.id, choice);
  };

  // Countdown timer using server time for accurate sync
  const getCountdown = () => {
    if (!currentRoom?.countdownEnd) return null;
    // Use server time from the room state
    const serverNow = currentRoom.serverTime;
    const end = new Date(currentRoom.countdownEnd).getTime();
    const diff = Math.max(0, Math.ceil((end - serverNow) / 1000));
    return diff;
  };

  const countdown = getCountdown();
  const myPlayer = currentRoom?.players.find(p => p.odrzerId === userId);

  return (
    <main className="min-h-screen flex flex-col items-center pt-[10vh] px-6 pb-20">
      <div className="max-w-[600px] w-full flex flex-col gap-6 animate-fade-in">
        {/* Header */}
        <header className="flex items-center justify-center border-b border-[var(--line)] pb-4">
          <h1 className="text-[0.85rem] uppercase tracking-widest">arena</h1>
        </header>

        {error && (
          <div className="text-red-400 text-sm text-center p-3 border border-red-400/30 bg-red-400/5">
            {error}
          </div>
        )}

        {/* LOBBY VIEW */}
        {view === "lobby" && (
          <>
            {/* Game Type Tabs */}
            <div className="flex gap-2 border-b border-[var(--line)] pb-3">
              <button
                onClick={() => setGameType("dice")}
                className={`px-4 py-2 text-sm transition-colors ${
                  gameType === "dice"
                    ? "text-[var(--text)] border-b-2 border-[var(--text)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                des
              </button>
              <button
                onClick={() => setGameType("pfc")}
                className={`px-4 py-2 text-sm transition-colors ${
                  gameType === "pfc"
                    ? "text-[var(--text)] border-b-2 border-[var(--text)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                pfc
              </button>
            </div>

            {/* Quick Match */}
            <div className="border border-[var(--line)] p-4">
              <h2 className="text-sm mb-3 text-[var(--text-muted)]">match rapide</h2>
              <div className="flex flex-wrap gap-2">
                {QUICK_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    onClick={() => handleQuickMatch(amount)}
                    disabled={loading || userBalance < amount}
                    className={`px-4 py-2 text-sm border border-[var(--line)] transition-colors
                      ${userBalance < amount 
                        ? "opacity-30 cursor-not-allowed" 
                        : "hover:border-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.03)]"
                      }`}
                  >
                    {amount}
                  </button>
                ))}
              </div>
            </div>

            {/* Join by Code */}
            <div className="border border-[var(--line)] p-4">
              <h2 className="text-sm mb-3 text-[var(--text-muted)]">rejoindre par code</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="CODE"
                  maxLength={6}
                  className="flex-1 px-3 py-2 bg-transparent border border-[var(--line)] text-sm 
                    placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--text-muted)]
                    uppercase tracking-widest"
                />
                <button
                  onClick={handleJoinByCode}
                  disabled={loading || !joinCode.trim()}
                  className="px-4 py-2 text-sm border border-[var(--line)] hover:border-[var(--text-muted)] 
                    hover:bg-[rgba(255,255,255,0.03)] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  go
                </button>
              </div>
            </div>

            {/* Create Room Button */}
            <button
              onClick={() => setView("create")}
              className="w-full py-3 text-sm border border-[var(--line)] hover:border-[var(--text-muted)] 
                hover:bg-[rgba(255,255,255,0.03)] transition-colors"
            >
              + creer une room
            </button>

            {/* Open Rooms List */}
            <div className="border border-[var(--line)] p-4">
              <h2 className="text-sm mb-3 text-[var(--text-muted)]">
                rooms ouvertes ({rooms.length})
              </h2>
              
              {rooms.length === 0 ? (
                <p className="text-[var(--text-muted)] text-sm text-center py-4">
                  aucune room disponible
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {rooms.map((room) => (
                    <button
                      key={room.id}
                      onClick={() => handleJoinRoom(room.id)}
                      disabled={loading || userBalance < room.amount}
                      className="flex items-center justify-between p-3 border border-[var(--line)] 
                        hover:border-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.03)] transition-colors
                        disabled:opacity-30 disabled:cursor-not-allowed text-left"
                    >
                      <div>
                        <span className="text-sm">
                          {room.gameType === "dice" ? "des" : "pfc"} - {room.amount}
                        </span>
                        <span className="text-[var(--text-muted)] text-xs ml-2">
                          {room.players.length}/{room.maxPlayers} joueurs
                        </span>
                      </div>
                      <span className="text-xs text-[var(--text-muted)]">
                        {room.status === "countdown" ? `${getCountdownForRoom(room)}s` : "en attente"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* CREATE VIEW */}
        {view === "create" && (
          <div className="border border-[var(--line)] p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm uppercase tracking-widest">creer une room</h2>
              <button
                onClick={() => setView("lobby")}
                className="text-[var(--text-muted)] hover:text-[var(--text)] text-sm"
              >
                annuler
              </button>
            </div>

            {/* Game Type */}
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-2 block">type de jeu</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setCreateGameType("dice")}
                  className={`flex-1 py-2 text-sm border transition-colors ${
                    createGameType === "dice"
                      ? "border-[var(--text)] bg-[rgba(255,255,255,0.05)]"
                      : "border-[var(--line)] hover:border-[var(--text-muted)]"
                  }`}
                >
                  des
                </button>
                <button
                  onClick={() => setCreateGameType("pfc")}
                  className={`flex-1 py-2 text-sm border transition-colors ${
                    createGameType === "pfc"
                      ? "border-[var(--text)] bg-[rgba(255,255,255,0.05)]"
                      : "border-[var(--line)] hover:border-[var(--text-muted)]"
                  }`}
                >
                  pfc
                </button>
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-2 block">mise par joueur</label>
              <input
                type="number"
                value={createAmount}
                onChange={(e) => setCreateAmount(Math.max(1, Math.min(1000, Number(e.target.value))))}
                min={1}
                max={1000}
                className="w-full px-3 py-2 bg-transparent border border-[var(--line)] text-sm 
                  focus:outline-none focus:border-[var(--text-muted)]"
              />
            </div>

            {/* Max Players */}
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-2 block">
                joueurs max: {createMaxPlayers}
              </label>
              <input
                type="range"
                value={createMaxPlayers}
                onChange={(e) => setCreateMaxPlayers(Number(e.target.value))}
                min={2}
                max={8}
                className="w-full"
              />
            </div>

            {/* Private */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={createPrivate}
                onChange={(e) => setCreatePrivate(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">room privee (avec code)</span>
            </label>

            {/* Create Button */}
            <button
              onClick={handleCreateRoom}
              disabled={loading || userBalance < createAmount}
              className="w-full py-3 text-sm border border-[var(--text)] hover:bg-[rgba(255,255,255,0.05)] 
                transition-colors disabled:opacity-30 disabled:cursor-not-allowed mt-2"
            >
              {loading ? "..." : `creer (-${createAmount})`}
            </button>
          </div>
        )}

        {/* ROOM VIEW */}
        {view === "room" && currentRoom && (
          <div className="border border-[var(--line)] p-6 flex flex-col gap-4">
            {/* Room Header */}
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-4">
              <div>
                <span className="text-sm uppercase tracking-widest">
                  {currentRoom.gameType === "dice" ? "des" : "pfc"}
                </span>
                <span className="text-[var(--text-muted)] text-sm ml-2">
                  - {currentRoom.amount} par joueur
                </span>
              </div>
              {currentRoom.code && (
                <span className="text-xs bg-[rgba(255,255,255,0.05)] px-2 py-1 tracking-widest">
                  {currentRoom.code}
                </span>
              )}
            </div>

            {/* Status */}
            <div className="text-center py-4">
              {currentRoom.status === "waiting" && (
                <p className="text-[var(--text-muted)]">
                  en attente de joueurs ({currentRoom.players.length}/{currentRoom.minPlayers} min)
                </p>
              )}
              {currentRoom.status === "countdown" && countdown !== null && (
                <div>
                  <p className="text-2xl font-bold">{countdown}s</p>
                  <p className="text-[var(--text-muted)] text-sm mt-1">
                    la partie commence bientot!
                  </p>
                </div>
              )}
              {currentRoom.status === "playing" && currentRoom.gameType === "dice" && (
                <p className="text-[var(--text-muted)]">
                  lancer des des en cours...
                </p>
              )}
              {currentRoom.status === "playing" && currentRoom.gameType === "pfc" && (
                <div>
                  {!myPlayer?.choice ? (
                    <div className="flex flex-col gap-3">
                      <p className="text-[var(--text-muted)] text-sm">fais ton choix!</p>
                      <div className="flex justify-center gap-4">
                        <button
                          onClick={() => handlePFCChoice("pierre")}
                          disabled={!!pfcChoice}
                          className="text-4xl p-4 border border-[var(--line)] hover:border-[var(--text)] 
                            hover:bg-[rgba(255,255,255,0.05)] transition-colors disabled:opacity-30"
                        >
                          🪨
                        </button>
                        <button
                          onClick={() => handlePFCChoice("feuille")}
                          disabled={!!pfcChoice}
                          className="text-4xl p-4 border border-[var(--line)] hover:border-[var(--text)] 
                            hover:bg-[rgba(255,255,255,0.05)] transition-colors disabled:opacity-30"
                        >
                          📄
                        </button>
                        <button
                          onClick={() => handlePFCChoice("ciseaux")}
                          disabled={!!pfcChoice}
                          className="text-4xl p-4 border border-[var(--line)] hover:border-[var(--text)] 
                            hover:bg-[rgba(255,255,255,0.05)] transition-colors disabled:opacity-30"
                        >
                          ✂️
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[var(--text-muted)]">
                      tu as choisi {pfcChoice === "pierre" ? "🪨" : pfcChoice === "feuille" ? "📄" : "✂️"} - en attente des autres...
                    </p>
                  )}
                </div>
              )}
              
              {/* Animation for finished games */}
              {currentRoom.status === "finished" && showAnimation && !animationComplete && (
                <>
                  {currentRoom.gameType === "dice" && (
                    <DiceAnimation
                      players={currentRoom.players.map(p => ({
                        id: p.id,
                        username: p.username,
                        odrzerId: p.odrzerId,
                        dice1: p.dice1,
                        dice2: p.dice2,
                        roll: p.roll,
                        rank: p.rank,
                        profit: p.profit,
                      }))}
                      currentUserId={userId}
                      onComplete={() => setAnimationComplete(true)}
                    />
                  )}
                  {currentRoom.gameType === "pfc" && (
                    <PFCAnimation
                      players={currentRoom.players.map(p => ({
                        id: p.id,
                        username: p.username,
                        odrzerId: p.odrzerId,
                        choice: p.choice as "pierre" | "feuille" | "ciseaux" | null,
                        rank: p.rank,
                        profit: p.profit,
                      }))}
                      currentUserId={userId}
                      onComplete={() => setAnimationComplete(true)}
                    />
                  )}
                </>
              )}
              
              {/* Results after animation */}
              {currentRoom.status === "finished" && animationComplete && (
                <div>
                  <p className="text-lg mb-4">partie terminee!</p>
                  {/* Results */}
                  <div className="flex flex-col gap-2">
                    {currentRoom.players
                      .filter(p => p.rank)
                      .sort((a, b) => (a.rank || 99) - (b.rank || 99))
                      .map((p) => (
                        <div
                          key={p.id}
                          className={`flex items-center justify-between p-3 border ${
                            p.odrzerId === userId
                              ? "border-[var(--text)] bg-[rgba(255,255,255,0.05)]"
                              : "border-[var(--line)]"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-lg">
                              {p.rank === 1 ? "🥇" : p.rank === 2 ? "🥈" : p.rank === 3 ? "🥉" : `#${p.rank}`}
                            </span>
                            <span className="text-sm">{p.username}</span>
                            {currentRoom.gameType === "dice" && p.dice1 && p.dice2 && (
                              <span className="text-[var(--text-muted)] text-sm">
                                ({p.dice1} + {p.dice2} = {p.roll})
                              </span>
                            )}
                            {currentRoom.gameType === "pfc" && p.choice && (
                              <span className="text-[var(--text-muted)] text-sm">
                                ({p.choice === "pierre" ? "🪨" : p.choice === "feuille" ? "📄" : "✂️"})
                              </span>
                            )}
                          </div>
                          <span className={`text-sm ${
                            (p.profit || 0) >= 0 ? "text-green-400" : "text-red-400"
                          }`}>
                            {(p.profit || 0) >= 0 ? "+" : ""}{p.profit?.toFixed(2)}€
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Players List */}
            {currentRoom.status !== "finished" && (
              <div>
                <h3 className="text-xs text-[var(--text-muted)] mb-2">
                  joueurs ({currentRoom.players.length}/{currentRoom.maxPlayers})
                </h3>
                <div className="flex flex-col gap-1">
                  {currentRoom.players.map((p) => (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between p-2 text-sm ${
                        p.odrzerId === userId ? "bg-[rgba(255,255,255,0.03)]" : ""
                      }`}
                    >
                      <span>
                        {p.username}
                        {p.odrzerId === currentRoom.hostId && (
                          <span className="text-[var(--text-muted)] text-xs ml-1">(host)</span>
                        )}
                      </span>
                      <span className={p.isReady ? "text-green-400" : "text-[var(--text-muted)]"}>
                        {p.isReady ? "pret" : "pas pret"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-4 border-t border-[var(--line)]">
              {currentRoom.status === "finished" && animationComplete && (
                <>
                  <button
                    onClick={async () => {
                      setLoading(true);
                      setError(null);
                      const res = await rematchRoom(currentRoom.id);
                      if (res.success && res.room) {
                        resetAnimationState();
                        setCurrentRoom(res.room);
                      } else {
                        setError(res.error || "erreur rematch");
                      }
                      setLoading(false);
                    }}
                    disabled={loading || userBalance < currentRoom.amount}
                    className="flex-1 py-2 text-sm border border-[var(--text)] hover:bg-[rgba(255,255,255,0.05)] 
                      transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {loading ? "..." : `rejouer (${currentRoom.amount}€)`}
                  </button>
                  <button
                    onClick={() => {
                      setCurrentRoom(null);
                      setView("lobby");
                      resetAnimationState();
                      loadRooms();
                    }}
                    className="px-4 py-2 text-sm border border-[var(--line)] hover:border-[var(--text-muted)] 
                      hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                  >
                    lobby
                  </button>
                </>
              )}
              {["waiting", "countdown"].includes(currentRoom.status) && (
                <>
                  <button
                    onClick={handleSetReady}
                    className={`flex-1 py-2 text-sm border transition-colors ${
                      myPlayer?.isReady
                        ? "border-green-400 text-green-400 hover:bg-green-400/10"
                        : "border-[var(--line)] hover:border-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.03)]"
                    }`}
                  >
                    {myPlayer?.isReady ? "pret!" : "je suis pret"}
                  </button>
                  <button
                    onClick={handleLeaveRoom}
                    disabled={loading}
                    className="px-4 py-2 text-sm border border-red-400/50 text-red-400 
                      hover:bg-red-400/10 transition-colors disabled:opacity-30"
                  >
                    quitter
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// Helper for lobby room countdown display using server time
function getCountdownForRoom(room: GameRoomPublic): number {
  if (!room.countdownEnd) return 0;
  // Use server time for accurate sync
  const serverNow = room.serverTime;
  const end = new Date(room.countdownEnd).getTime();
  return Math.max(0, Math.ceil((end - serverNow) / 1000));
}
