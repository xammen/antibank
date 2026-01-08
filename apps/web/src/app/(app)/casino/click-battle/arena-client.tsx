"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  createClickBattleRoom,
  joinRoom,
  leaveRoom,
  setReady,
  getOpenRooms,
  getRoomState,
  quickClickBattleMatch,
  checkClickBattleStart,
  submitClickBattleClicks,
  getMyActiveRoom,
  rematchRoom,
  type GameRoomPublic,
} from "@/actions/game-room";

interface ClickBattleArenaClientProps {
  userId: string;
  userBalance: string;
  userName: string;
}

type View = "lobby" | "room" | "create";
type GamePhase = "waiting" | "countdown" | "playing" | "submitting" | "revealing" | "finished";

const QUICK_AMOUNTS = [1, 5, 10, 25, 50];
const DURATIONS = [5, 10, 15, 20];

export function ClickBattleArenaClient({ userId, userBalance: userBalanceStr, userName }: ClickBattleArenaClientProps) {
  const userBalance = Number(userBalanceStr);
  const [view, setView] = useState<View>("lobby");
  const [rooms, setRooms] = useState<GameRoomPublic[]>([]);
  const [currentRoom, setCurrentRoom] = useState<GameRoomPublic | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  
  // Create room form
  const [createAmount, setCreateAmount] = useState(5);
  const [createDuration, setCreateDuration] = useState(10);
  const [createMaxPlayers, setCreateMaxPlayers] = useState(2);
  const [createPrivate, setCreatePrivate] = useState(false);

  // Game state
  const [gamePhase, setGamePhase] = useState<GamePhase>("waiting");
  const [localClicks, setLocalClicks] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<{
    myClicks: number;
    opponentClicks: { odrzerId: string; username: string; clicks: number }[];
    won: boolean | null;
    profit: number;
    rank: number;
  } | null>(null);
  
  const localClicksRef = useRef(0);
  const clickButtonRef = useRef<HTMLButtonElement>(null);
  const gameStartTimeRef = useRef<number | null>(null);

  // Load rooms and check for active room
  const loadRooms = useCallback(async () => {
    const [roomsRes, activeRes] = await Promise.all([
      getOpenRooms("click_battle"),
      getMyActiveRoom(),
    ]);
    
    if (roomsRes.success) {
      setRooms(roomsRes.rooms.filter(r => r.gameType === "click_battle"));
    }
    
    if (activeRes.success && activeRes.room && activeRes.room.gameType === "click_battle") {
      setCurrentRoom(activeRes.room);
      setView("room");
      
      // Restore game phase based on room status
      if (activeRes.room.status === "playing") {
        setGamePhase("playing");
        if (activeRes.room.startedAt) {
          gameStartTimeRef.current = new Date(activeRes.room.startedAt).getTime();
        }
      } else if (activeRes.room.status === "revealing") {
        setGamePhase("submitting");
      } else if (activeRes.room.status === "finished") {
        setGamePhase("finished");
      }
    }
  }, []);

  // Poll room state when in a room
  useEffect(() => {
    if (view !== "room" || !currentRoom) return;

    const poll = async () => {
      const res = await getRoomState(currentRoom.id);
      if (res.success && res.room) {
        setCurrentRoom(res.room);
        
        // Handle phase transitions
        if (res.room.status === "countdown" && res.room.countdownEnd) {
          const now = Date.now();
          const end = new Date(res.room.countdownEnd).getTime();
          const timeLeft = end - now;
          
          if (timeLeft <= 0) {
            // Countdown finished, check if game started
            const startRes = await checkClickBattleStart(res.room.id);
            if (startRes.success && startRes.room) {
              setCurrentRoom(startRes.room);
              if (startRes.startTime) {
                gameStartTimeRef.current = startRes.startTime;
                setGamePhase("playing");
                setLocalClicks(0);
                localClicksRef.current = 0;
              }
            }
          } else {
            setGamePhase("countdown");
            setCountdown(Math.ceil(timeLeft / 1000));
          }
        } else if (res.room.status === "playing") {
          if (gamePhase !== "playing" && gamePhase !== "submitting") {
            setGamePhase("playing");
            if (res.room.startedAt) {
              gameStartTimeRef.current = new Date(res.room.startedAt).getTime();
            }
          }
        } else if (res.room.status === "finished") {
          setGamePhase("finished");
        }
      } else if (!res.success) {
        setCurrentRoom(null);
        setView("lobby");
        resetGameState();
        loadRooms();
      }
    };

    const interval = setInterval(poll, 1000);
    poll(); // Initial poll
    return () => clearInterval(interval);
  }, [view, currentRoom, gamePhase, loadRooms]);

  // Game timer
  useEffect(() => {
    if (gamePhase !== "playing" || !gameStartTimeRef.current || !currentRoom?.duration) return;
    
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - gameStartTimeRef.current!) / 1000;
      const remaining = Math.max(0, currentRoom.duration! - elapsed);
      setTimeLeft(remaining);
      
      if (remaining <= 0 && !submitted) {
        setSubmitted(true);
        setGamePhase("submitting");
        handleSubmitClicks();
      }
    }, 50);
    
    return () => clearInterval(interval);
  }, [gamePhase, currentRoom?.duration, submitted]);

  // Countdown timer
  useEffect(() => {
    if (gamePhase !== "countdown" || !currentRoom?.countdownEnd) return;
    
    const interval = setInterval(() => {
      const now = Date.now();
      const end = new Date(currentRoom.countdownEnd!).getTime();
      const remaining = Math.ceil((end - now) / 1000);
      
      if (remaining <= 0) {
        setCountdown(0);
      } else {
        setCountdown(remaining);
      }
    }, 100);
    
    return () => clearInterval(interval);
  }, [gamePhase, currentRoom?.countdownEnd]);

  // Initial load
  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  // Poll lobby
  useEffect(() => {
    if (view !== "lobby") return;
    const interval = setInterval(loadRooms, 2000);
    return () => clearInterval(interval);
  }, [view, loadRooms]);

  const resetGameState = () => {
    setGamePhase("waiting");
    setLocalClicks(0);
    localClicksRef.current = 0;
    setTimeLeft(0);
    setCountdown(3);
    setSubmitted(false);
    setResult(null);
    gameStartTimeRef.current = null;
  };

  const handleSubmitClicks = async () => {
    if (!currentRoom) return;
    
    const clicks = localClicksRef.current;
    const res = await submitClickBattleClicks(currentRoom.id, clicks);
    
    if (res.success) {
      if (res.result) {
        setResult(res.result);
        setGamePhase("finished");
      } else if (res.waiting) {
        setGamePhase("revealing");
      }
      if (res.room) {
        setCurrentRoom(res.room);
      }
    } else {
      setError(res.error || "erreur soumission");
    }
  };

  // Check for results when in revealing phase
  useEffect(() => {
    if (gamePhase !== "revealing" || !currentRoom) return;
    
    const checkResult = async () => {
      const res = await getRoomState(currentRoom.id);
      if (res.success && res.room) {
        setCurrentRoom(res.room);
        
        if (res.room.status === "finished") {
          // Build result from room data
          const myPlayer = res.room.players.find(p => p.odrzerId === userId);
          const opponents = res.room.players
            .filter(p => p.odrzerId !== userId)
            .map(p => ({
              odrzerId: p.odrzerId,
              username: p.username,
              clicks: p.clicks || 0,
            }));
          
          if (myPlayer) {
            const maxClicks = Math.max(...res.room.players.map(p => p.clicks || 0));
            const myClicks = myPlayer.clicks || 0;
            const isTie = res.room.players.filter(p => p.clicks === maxClicks).length === res.room.players.length;
            
            setResult({
              myClicks,
              opponentClicks: opponents,
              won: isTie ? null : myClicks === maxClicks,
              profit: myPlayer.profit || 0,
              rank: myPlayer.rank || 99,
            });
            setGamePhase("finished");
          }
        }
      }
    };
    
    const interval = setInterval(checkResult, 1000);
    return () => clearInterval(interval);
  }, [gamePhase, currentRoom, userId]);

  // Handlers
  const handleQuickMatch = async (amount: number) => {
    setLoading(true);
    setError(null);
    
    const res = await quickClickBattleMatch(amount, createDuration);
    
    if (res.success && res.room) {
      setCurrentRoom(res.room);
      setView("room");
      resetGameState();
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
      resetGameState();
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
    
    const res = await createClickBattleRoom(createAmount, createDuration, createPrivate, createMaxPlayers);
    
    if (res.success && res.room) {
      setCurrentRoom(res.room);
      setView("room");
      resetGameState();
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
      resetGameState();
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
    
    // Check if this triggers the game start
    const res = await checkClickBattleStart(currentRoom.id);
    if (res.success && res.room) {
      setCurrentRoom(res.room);
    }
  };

  const handleClick = () => {
    if (gamePhase !== "playing") return;
    
    setLocalClicks(prev => prev + 1);
    localClicksRef.current += 1;
    
    // Visual feedback
    if (clickButtonRef.current) {
      clickButtonRef.current.style.transform = "scale(0.95)";
      setTimeout(() => {
        if (clickButtonRef.current) {
          clickButtonRef.current.style.transform = "scale(1)";
        }
      }, 50);
    }
  };

  const handleRematch = async () => {
    if (!currentRoom) return;
    
    setLoading(true);
    const res = await rematchRoom(currentRoom.id);
    
    if (res.success && res.room) {
      setCurrentRoom(res.room);
      resetGameState();
    } else {
      setError(res.error || "erreur");
    }
    
    setLoading(false);
  };

  const myPlayer = currentRoom?.players.find(p => p.odrzerId === userId);
  const allReady = currentRoom?.players.every(p => p.isReady) && 
                   (currentRoom?.players.length || 0) >= (currentRoom?.minPlayers || 2);

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)]">
      {/* Header */}
      <header className="flex items-center justify-center p-4 border-b border-[var(--line)]">
        <span className="text-sm uppercase tracking-widest">click battle</span>
      </header>

      {error && (
        <div className="mx-4 mt-4 p-3 border border-red-500/30 bg-red-500/10 text-red-400 text-xs">
          {error}
        </div>
      )}

      <div className="flex-1 flex flex-col p-4">
        {/* LOBBY VIEW */}
        {view === "lobby" && (
          <div className="flex-1 flex flex-col gap-6 max-w-lg mx-auto w-full">
            {/* Quick Match */}
            <div className="border border-[var(--line)] p-4">
              <h2 className="text-[0.7rem] uppercase tracking-widest text-[var(--text-muted)] mb-3">match rapide</h2>
              
              {/* Duration selector */}
              <div className="mb-3">
                <p className="text-xs text-[var(--text-muted)] mb-2">duree: {createDuration}s</p>
                <div className="flex gap-2">
                  {DURATIONS.map((d) => (
                    <button
                      key={d}
                      onClick={() => setCreateDuration(d)}
                      className={`flex-1 py-1.5 text-xs border transition-colors ${
                        createDuration === d
                          ? "border-[var(--text)] bg-[rgba(255,255,255,0.05)]"
                          : "border-[var(--line)] hover:border-[var(--text-muted)]"
                      }`}
                    >
                      {d}s
                    </button>
                  ))}
                </div>
              </div>
              
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
                    {amount}€
                  </button>
                ))}
              </div>
            </div>

            {/* Join by Code */}
            <div className="border border-[var(--line)] p-4">
              <h2 className="text-[0.7rem] uppercase tracking-widest text-[var(--text-muted)] mb-3">rejoindre par code</h2>
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

            {/* Open Rooms */}
            {rooms.length > 0 && (
              <div className="border border-[var(--line)] p-4">
                <h2 className="text-[0.7rem] uppercase tracking-widest text-[var(--text-muted)] mb-3">
                  rooms ouvertes ({rooms.length})
                </h2>
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
                        <span className="text-sm">{room.amount}€ - {room.duration}s</span>
                        <span className="text-[var(--text-muted)] text-xs ml-2">
                          {room.players.length}/{room.maxPlayers}
                        </span>
                      </div>
                      <span className="text-xs text-[var(--text-muted)]">
                        {room.status === "countdown" ? "bientot" : "en attente"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* CREATE VIEW */}
        {view === "create" && (
          <div className="flex-1 flex flex-col gap-4 max-w-lg mx-auto w-full border border-[var(--line)] p-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm uppercase tracking-widest">creer une room</h2>
              <button
                onClick={() => setView("lobby")}
                className="text-[var(--text-muted)] hover:text-[var(--text)] text-sm"
              >
                annuler
              </button>
            </div>

            {/* Duration */}
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-2 block">duree: {createDuration}s</label>
              <div className="flex gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setCreateDuration(d)}
                    className={`flex-1 py-2 text-sm border transition-colors ${
                      createDuration === d
                        ? "border-[var(--text)] bg-[rgba(255,255,255,0.05)]"
                        : "border-[var(--line)] hover:border-[var(--text-muted)]"
                    }`}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-2 block">mise par joueur</label>
              <input
                type="number"
                value={createAmount}
                onChange={(e) => setCreateAmount(Math.max(0.5, Math.min(1000, Number(e.target.value))))}
                min={0.5}
                max={1000}
                step={0.5}
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

            <button
              onClick={handleCreateRoom}
              disabled={loading || userBalance < createAmount}
              className="w-full py-3 text-sm border border-[var(--text)] hover:bg-[rgba(255,255,255,0.05)] 
                transition-colors disabled:opacity-30 disabled:cursor-not-allowed mt-2"
            >
              {loading ? "..." : `creer (-${createAmount}€)`}
            </button>
          </div>
        )}

        {/* ROOM VIEW */}
        {view === "room" && currentRoom && (
          <div className="flex-1 flex flex-col items-center justify-center">
            {/* Waiting for players */}
            {(gamePhase === "waiting" && currentRoom.status === "waiting") && (
              <div className="text-center max-w-md w-full">
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-2">click battle</p>
                <p className="text-lg mb-1">{currentRoom.amount}€ - {currentRoom.duration}s</p>
                {currentRoom.code && (
                  <p className="text-sm bg-[rgba(255,255,255,0.05)] px-3 py-1 inline-block tracking-widest mb-4">
                    {currentRoom.code}
                  </p>
                )}
                
                <div className="border border-[var(--line)] p-4 mb-4">
                  <p className="text-xs text-[var(--text-muted)] mb-3">
                    joueurs ({currentRoom.players.length}/{currentRoom.maxPlayers})
                  </p>
                  <div className="flex flex-col gap-2">
                    {currentRoom.players.map((p) => (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between p-2 text-sm ${
                          p.odrzerId === userId ? "bg-[rgba(255,255,255,0.03)]" : ""
                        }`}
                      >
                        <span>{p.username.toLowerCase()}</span>
                        <span className={p.isReady ? "text-green-400" : "text-[var(--text-muted)]"}>
                          {p.isReady ? "pret" : "..."}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleSetReady}
                    className={`flex-1 py-3 text-sm border transition-colors ${
                      myPlayer?.isReady
                        ? "border-green-500/50 text-green-400 bg-green-500/10"
                        : "border-[var(--line)] hover:border-[var(--text)]"
                    }`}
                  >
                    {myPlayer?.isReady ? "pret!" : "je suis pret"}
                  </button>
                  <button
                    onClick={handleLeaveRoom}
                    disabled={loading}
                    className="px-4 py-3 text-sm border border-red-500/50 text-red-400 
                      hover:bg-red-500/10 transition-colors"
                  >
                    quitter
                  </button>
                </div>
                
                {allReady && (
                  <p className="text-xs text-[var(--text-muted)] mt-3 animate-pulse">
                    demarrage imminent...
                  </p>
                )}
              </div>
            )}

            {/* Countdown */}
            {(gamePhase === "countdown" || currentRoom.status === "countdown") && (
              <div className="text-center">
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-4">preparez-vous</p>
                <div className="text-[8rem] font-light leading-none tabular-nums">
                  {countdown > 0 ? countdown : "GO!"}
                </div>
              </div>
            )}

            {/* Playing */}
            {gamePhase === "playing" && (
              <div className="flex flex-col items-center gap-6 w-full max-w-md">
                {/* Timer bar */}
                <div className="w-full">
                  <div className="h-2 bg-[var(--line)] overflow-hidden">
                    <div 
                      className="h-full bg-[var(--text)] transition-all duration-100"
                      style={{ width: `${(timeLeft / (currentRoom.duration || 10)) * 100}%` }}
                    />
                  </div>
                  <div className="text-center mt-2 text-sm tabular-nums text-[var(--text-muted)]">
                    {timeLeft.toFixed(1)}s
                  </div>
                </div>

                {/* Click button */}
                <button
                  ref={clickButtonRef}
                  onClick={handleClick}
                  className="w-56 h-56 md:w-72 md:h-72 border-2 border-[var(--line)] hover:border-[var(--text)]
                    flex flex-col items-center justify-center transition-all duration-75 
                    select-none touch-manipulation active:bg-[rgba(255,255,255,0.05)]"
                >
                  <span className="text-6xl md:text-7xl font-light tabular-nums">{localClicks}</span>
                  <span className="text-xs text-[var(--text-muted)] mt-2 uppercase tracking-widest">clics</span>
                </button>
              </div>
            )}

            {/* Submitting */}
            {gamePhase === "submitting" && (
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-[var(--line)] border-t-[var(--text)] rounded-full animate-spin mx-auto mb-4" />
                <p className="text-sm text-[var(--text-muted)]">envoi des resultats...</p>
                <p className="text-2xl tabular-nums mt-2">{localClicks} clics</p>
              </div>
            )}

            {/* Revealing */}
            {gamePhase === "revealing" && (
              <div className="text-center">
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest animate-pulse mb-4">
                  en attente des autres joueurs...
                </p>
                <p className="text-2xl tabular-nums">{localClicks} clics</p>
              </div>
            )}

            {/* Finished */}
            {gamePhase === "finished" && result && (
              <div className="text-center max-w-md w-full">
                <p className={`text-4xl font-light mb-4 ${
                  result.won === true ? 'text-green-400' : 
                  result.won === false ? 'text-red-400' : 
                  'text-[var(--text-muted)]'
                }`}>
                  {result.won === true ? "victoire" : result.won === false ? "defaite" : "egalite"}
                </p>
                
                <p className={`text-xl tabular-nums mb-6 ${result.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {result.profit > 0 ? "+" : ""}{result.profit.toFixed(2)}€
                </p>

                {/* Scores */}
                <div className="border border-[var(--line)] p-4 mb-6">
                  <div className="flex items-center justify-between p-2 bg-[rgba(255,255,255,0.03)]">
                    <span className="text-sm">{userName.toLowerCase()}</span>
                    <span className="text-lg tabular-nums">{result.myClicks}</span>
                  </div>
                  {result.opponentClicks.map((opp) => (
                    <div key={opp.odrzerId} className="flex items-center justify-between p-2">
                      <span className="text-sm text-[var(--text-muted)]">{opp.username.toLowerCase()}</span>
                      <span className="text-lg tabular-nums text-[var(--text-muted)]">{opp.clicks}</span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleRematch}
                    disabled={loading || userBalance < currentRoom.amount}
                    className="flex-1 py-3 text-sm border border-[var(--text)] hover:bg-[rgba(255,255,255,0.05)] 
                      transition-colors disabled:opacity-30"
                  >
                    {loading ? "..." : `rejouer (${currentRoom.amount}€)`}
                  </button>
                  <button
                    onClick={() => {
                      setCurrentRoom(null);
                      setView("lobby");
                      resetGameState();
                      loadRooms();
                    }}
                    className="px-4 py-3 text-sm border border-[var(--line)] hover:border-[var(--text-muted)]"
                  >
                    lobby
                  </button>
                </div>
              </div>
            )}

            {/* Finished without result (fallback) */}
            {gamePhase === "finished" && !result && currentRoom.status === "finished" && (
              <div className="text-center">
                <p className="text-lg mb-4">partie terminee</p>
                <div className="border border-[var(--line)] p-4 mb-6">
                  {currentRoom.players
                    .sort((a, b) => (a.rank || 99) - (b.rank || 99))
                    .map((p) => (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between p-2 ${
                          p.odrzerId === userId ? "bg-[rgba(255,255,255,0.03)]" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span>{p.rank === 1 ? "🥇" : p.rank === 2 ? "🥈" : `#${p.rank}`}</span>
                          <span className="text-sm">{p.username.toLowerCase()}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm tabular-nums">{p.clicks} clics</span>
                          <span className={`text-xs ml-2 ${(p.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {(p.profit || 0) >= 0 ? "+" : ""}{p.profit?.toFixed(2)}€
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
                <button
                  onClick={() => {
                    setCurrentRoom(null);
                    setView("lobby");
                    resetGameState();
                    loadRooms();
                  }}
                  className="px-6 py-2 text-sm border border-[var(--line)] hover:border-[var(--text-muted)]"
                >
                  retour
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
