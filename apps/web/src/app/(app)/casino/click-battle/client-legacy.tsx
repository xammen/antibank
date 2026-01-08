"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  createClickBattle,
  acceptClickBattle,
  startClickBattle,
  submitClickBattleResult,
  getClickBattleState,
  getMyPendingBattles,
  getClickBattleTargets,
  cancelClickBattle
} from "@/actions/click-battle";

interface ClickBattleClientProps {
  userId: string;
  userBalance: string;
  userName: string;
}

type GameState = "idle" | "waiting" | "ready" | "ready_waiting" | "countdown" | "playing" | "submitting" | "revealing" | "result";

interface BattleData {
  id: string;
  player1Id: string;
  player1Name: string;
  player2Id: string;
  player2Name: string;
  amount: number;
  duration: number;
  status: string;
  player1Clicks: number | null;
  player2Clicks: number | null;
  winnerId: string | null;
  startedAt: number | null;
  player1Ready?: boolean;
  player2Ready?: boolean;
}

export function ClickBattleClient({ userId, userBalance, userName }: ClickBattleClientProps) {
  const [gameState, setGameState] = useState<GameState>("idle");
  const [activeBattleId, setActiveBattleId] = useState<string | null>(null);
  const [targets, setTargets] = useState<Array<{ id: string; discordUsername: string; balance: number }>>([]);
  const [pendingChallenges, setPendingChallenges] = useState<Array<{ id: string; challengerName: string; amount: number }>>([]);
  const [selectedTarget, setSelectedTarget] = useState("");
  const [betAmount, setBetAmount] = useState("1");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [battleData, setBattleData] = useState<BattleData | null>(null);
  const [imReady, setImReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  
  // Game logic state
  const [localClicks, setLocalClicks] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [resultProfit, setResultProfit] = useState(0);
  const [isWon, setIsWon] = useState<boolean | null>(null);
  const [opponentClicksDisplay, setOpponentClicksDisplay] = useState<number | null>(null);
  const [myClicksDisplay, setMyClicksDisplay] = useState<number | null>(null);
  
  const localClicksRef = useRef(0);
  const clickButtonRef = useRef<HTMLButtonElement>(null);

  // Poll for pending battles and targets when idle
  const loadLobbyData = useCallback(async () => {
    if (gameState !== "idle" && gameState !== "waiting") return;

    const [myBattlesRes, targetsRes] = await Promise.all([
      getMyPendingBattles(),
      getClickBattleTargets()
    ]);

    if (myBattlesRes.success) {
      if (myBattlesRes.challenges) {
        setPendingChallenges(myBattlesRes.challenges);
      }
      
      // If we have an active battle, join it immediately
      if (myBattlesRes.myBattles && myBattlesRes.myBattles.length > 0) {
        const active = myBattlesRes.myBattles[0];
        setActiveBattleId(active.id);
        
        // Determine state based on status
        if (active.status === "accepted") {
          setGameState("ready");
        } else if (active.status === "playing") {
          setGameState("playing");
        } else if (active.status === "revealing") {
          setGameState("submitting"); 
        } else if (active.status === "completed") {
          // If we rejoin a completed battle (that I am part of and haven't dismissed)
          // We can show the result immediately
          setGameState("result");
          // We need battle details to populate result, which will come from pollBattleState
          // But we can trigger poll immediately
        }
      }
    }

    if (targetsRes.success && targetsRes.targets) {
      setTargets(targetsRes.targets);
    }
    
    setIsLoading(false);
  }, [gameState]);

  useEffect(() => {
    loadLobbyData();
    const interval = setInterval(loadLobbyData, 1000);
    return () => clearInterval(interval);
  }, [loadLobbyData]);

  const pollBattleState = useCallback(async () => {
    if (!activeBattleId) return;

    const res = await getClickBattleState(activeBattleId);
    if (res.success && res.battle) {
      const b = res.battle;
      setBattleData(b as BattleData);
      
      const isPlayer1 = b.player1Id === userId;
      setImReady(isPlayer1 ? b.player1Ready : b.player2Ready);
      setOpponentReady(isPlayer1 ? b.player2Ready : b.player1Ready);

      // Status transitions
      if (gameState === "waiting") {
        if (b.status === "accepted") {
          setGameState("ready");
        } else if (b.status === "cancelled") {
          setGameState("idle");
          setActiveBattleId(null);
          setError("duel annule");
        }
      }
      else if (gameState === "ready" || gameState === "ready_waiting") {
        // Check if both are ready and countdown should start
        if (b.startedAt) {
          const now = Date.now();
          const start = b.startedAt;
          const diff = now - start;
          
          if (diff < 0) {
            // startedAt is in the future (countdown not started yet)
            setGameState("countdown");
            setCountdown(Math.ceil(Math.abs(diff) / 1000));
          } else if (diff < 100) {
            // Just started
            setGameState("playing");
          } else {
            setGameState("playing");
          }
        }
      }
      else if (gameState === "result") {
         handleFinalResult(b as BattleData);
      }
      // Note: "playing" and "submitting" are handled by local timer and effects
    }
  }, [activeBattleId, gameState, userId]); // Removed localClicks from dependencies

  useEffect(() => {
    if (!activeBattleId) return;
    pollBattleState();
    const interval = setInterval(pollBattleState, 1000);
    return () => clearInterval(interval);
  }, [activeBattleId, pollBattleState]);

  // Local timer for playing state
  useEffect(() => {
    if (gameState !== "playing" || !battleData?.startedAt) return;
    
    const interval = setInterval(() => {
       const now = Date.now();
       const elapsed = (now - (battleData.startedAt as number)) / 1000;
       const remaining = Math.max(0, battleData.duration - elapsed);
       setTimeLeft(remaining);
       
       if (remaining <= 0) {
          setGameState("submitting");
          submitResult(localClicksRef.current);
       }
    }, 100);
    
    return () => clearInterval(interval);
  }, [gameState, battleData]);


  // Handle countdown - sync with server startTime
  useEffect(() => {
    if (gameState !== "countdown" || !battleData?.startedAt) return;
    
    const interval = setInterval(() => {
      const now = Date.now();
      const startTime = battleData.startedAt as number;
      const diff = startTime - now;
      
      if (diff <= 0) {
        setGameState("playing");
        setCountdown(0);
      } else {
        setCountdown(Math.ceil(diff / 1000));
      }
    }, 100);
    
    return () => clearInterval(interval);
  }, [gameState, battleData?.startedAt]);

  // Submit result wrapper
  const submitResult = async (clicks: number) => {
    if (!activeBattleId) return;
    
    // Prevent double submit
    if (battleData?.player1Id === userId && battleData?.player1Clicks !== null) return;
    if (battleData?.player2Id === userId && battleData?.player2Clicks !== null) return;

    try {
      const res = await submitClickBattleResult(activeBattleId, clicks);
      if (res.success) {
        if (res.waiting) {
          // Stay in submitting, show waiting message
        } else if (res.result) {
          // We have immediate result (opponent already submitted)
          triggerRevealAnimation(res.result);
        }
      } else {
        setError(res.error || "erreur soumission");
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Check if we can trigger reveal from polling (if opponent submitted after us)
  useEffect(() => {
    if (gameState === "submitting" && battleData?.status === "completed") {
       // We need to construct the result object from battleData
       const isP1 = battleData.player1Id === userId;
       const myClicks = isP1 ? battleData.player1Clicks! : battleData.player2Clicks!;
       const oppClicks = isP1 ? battleData.player2Clicks! : battleData.player1Clicks!;
       
       // Calculate profit/won based on winnerId
       const won = battleData.winnerId === userId ? true : (battleData.winnerId === null ? null : false);
       // Profit calculation is complex to replicate exactly without the API result, 
       // but typically we can get it from the final result payload.
       // However, since we might miss the API response `result` payload if we reload,
       // let's rely on the visual display values first.
       
       // Note: pollBattleState calls handleFinalResult if completed.
       // We should ensure we don't double-trigger animation.
       if (!myClicksDisplay) { // If not yet revealed
           triggerRevealAnimation({
               myClicks,
               opponentClicks: oppClicks,
               won,
               profit: 0 // We don't have profit easily here, but visual is most important
           });
       }
    }
  }, [battleData, gameState]);

  const triggerRevealAnimation = async (result: any) => {
    setGameState("revealing");
    
    // 1. Show ???
    setMyClicksDisplay(null);
    setOpponentClicksDisplay(null);
    
    // 2. Reveal MY score after 2s
    await new Promise(r => setTimeout(r, 2000));
    setMyClicksDisplay(result.myClicks);
    
    // 3. Reveal OPPONENT score after 3s more
    await new Promise(r => setTimeout(r, 3000));
    setOpponentClicksDisplay(result.opponentClicks);
    
    // 4. Show Winner
    setIsWon(result.won);
    setResultProfit(result.profit);
    
    await new Promise(r => setTimeout(r, 1000));
    setGameState("result");
  };

  const handleFinalResult = (battle: BattleData) => {
    // Used when we load into a completed battle
    const isP1 = battle.player1Id === userId;
    setMyClicksDisplay(isP1 ? battle.player1Clicks : battle.player2Clicks);
    setOpponentClicksDisplay(isP1 ? battle.player2Clicks : battle.player1Clicks);
    setIsWon(battle.winnerId === userId ? true : (battle.winnerId === null ? null : false));
  };

  // Actions
  const handleChallenge = async () => {
    if (!selectedTarget) return;
    const amount = parseFloat(betAmount);
    if (isNaN(amount) || amount < 0.5) {
      setError("mise invalide");
      return;
    }
    
    setIsLoading(true);
    const res = await createClickBattle(selectedTarget, amount);
    setIsLoading(false);
    
    if (res.success && res.battle) {
      setActiveBattleId(res.battle.id);
      setGameState("waiting");
    } else {
      setError(res.error || "erreur creation");
      setTimeout(() => setError(null), 3000);
    }
  };

  const handleAccept = async (id: string) => {
    setIsLoading(true);
    const res = await acceptClickBattle(id);
    setIsLoading(false);
    
    if (res.success && res.battle) {
      setActiveBattleId(res.battle.id);
      setGameState("ready");
    } else {
      setError(res.error || "erreur acceptation");
      setTimeout(() => setError(null), 3000);
    }
  };

  const handleStart = async () => {
    if (!activeBattleId) return;
    const res = await startClickBattle(activeBattleId);
    if (res.success) {
      if (res.waiting) {
        // Waiting for opponent to be ready
        setGameState("ready_waiting");
        setImReady(true);
      } else if (res.startTime) {
        // Both ready - countdown will start
        const now = Date.now();
        const diff = res.startTime - now;
        if (diff > 0) {
          setGameState("countdown");
          setCountdown(Math.ceil(diff / 1000));
        } else {
          setGameState("playing");
        }
      }
    } else {
      setError(res.error || "erreur demarrage");
    }
  };

  const handleGameClick = () => {
    if (gameState !== "playing") return;
    setLocalClicks(prev => prev + 1);
    localClicksRef.current += 1;
    
    // Visual feedback
    if (clickButtonRef.current) {
      const btn = clickButtonRef.current;
      btn.style.transform = "scale(0.95)";
      setTimeout(() => {
        btn.style.transform = "scale(1)";
      }, 50);
      
      // Add ripple/particle (simplified via DOM)
      // For now just the scale is fine as per "visual feedback"
    }
  };

  const resetGame = () => {
    setGameState("idle");
    setActiveBattleId(null);
    setLocalClicks(0);
    localClicksRef.current = 0;
    setMyClicksDisplay(null);
    setOpponentClicksDisplay(null);
    setBattleData(null);
    setResultProfit(0);
    setImReady(false);
    setOpponentReady(false);
  };

  // Render helpers
  const getOpponentName = () => {
    if (!battleData) return "adversaire";
    return battleData.player1Id === userId ? battleData.player2Name : battleData.player1Name;
  };

  const balance = Number(userBalance);

  if (isLoading && gameState === "idle") {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-[var(--text-muted)]">chargement...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-[var(--line)]">
        <div className="flex items-center gap-4">
          <Link
            href="/casino"
            className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-sm"
          >
            &larr; casino
          </Link>
          <span className="text-sm text-[var(--text-muted)]">click battle</span>
        </div>
        <div className="text-sm tabular-nums">{balance.toFixed(2)}€</div>
      </header>

      {error && (
        <div className="mx-4 mt-4 p-3 border border-red-500/30 bg-red-500/10 text-red-400 text-xs">
          {error}
        </div>
      )}

      <div className="flex-1 flex flex-col p-4">
        {/* IDLE VIEW */}
        {gameState === "idle" && (
          <div className="flex-1 flex flex-col lg:flex-row gap-6">
            {/* Create Challenge */}
            <section className="flex-1 flex flex-col gap-4 p-4 border border-[var(--line)]">
              <h2 className="text-[0.7rem] uppercase tracking-widest text-[var(--text-muted)]">lancer un defi</h2>
              
              <div className="flex flex-col gap-2">
                <label className="text-xs text-[var(--text-muted)]">adversaire</label>
                <select 
                  className="bg-transparent border border-[var(--line)] p-2 text-sm focus:border-[var(--text)] outline-none"
                  value={selectedTarget}
                  onChange={(e) => setSelectedTarget(e.target.value)}
                >
                  <option value="" className="bg-[var(--bg)]">choisir...</option>
                  {targets.map(t => (
                    <option key={t.id} value={t.id} className="bg-[var(--bg)]">
                      {t.discordUsername.toLowerCase()} ({t.balance.toFixed(2)}€)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs text-[var(--text-muted)]">mise (€)</label>
                <input 
                  type="number" 
                  min="0.5" 
                  max="100" 
                  step="0.5"
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  className="bg-transparent border border-[var(--line)] p-2 text-sm focus:border-[var(--text)] outline-none tabular-nums"
                />
              </div>

              <button 
                onClick={handleChallenge}
                disabled={!selectedTarget || parseFloat(betAmount) < 0.5}
                className="mt-auto py-3 border border-[var(--line)] hover:border-[var(--text)] hover:bg-[rgba(255,255,255,0.03)] 
                  text-xs uppercase tracking-widest transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                defier
              </button>
            </section>

            {/* Pending Challenges */}
            <section className="flex-1 flex flex-col gap-4 p-4 border border-[var(--line)]">
              <h2 className="text-[0.7rem] uppercase tracking-widest text-[var(--text-muted)]">defis recus</h2>
              
              {pendingChallenges.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] text-xs">
                  aucun defi en attente
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {pendingChallenges.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-3 border border-[var(--line)]">
                      <div>
                        <div className="text-sm">{c.challengerName.toLowerCase()}</div>
                        <div className="text-xs text-[var(--text-muted)] tabular-nums">{c.amount.toFixed(2)}€</div>
                      </div>
                      <button 
                        onClick={() => handleAccept(c.id)}
                        className="px-3 py-1.5 border border-[var(--line)] hover:border-[var(--text)] hover:bg-[rgba(255,255,255,0.03)]
                          text-xs uppercase tracking-wider transition-all"
                      >
                        accepter
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* WAITING VIEW */}
        {gameState === "waiting" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6">
            <div className="w-8 h-8 border-2 border-[var(--line)] border-t-[var(--text)] rounded-full animate-spin" />
            <div className="text-center">
              <p className="text-sm">attente de {getOpponentName().toLowerCase()}...</p>
              <p className="text-xs text-[var(--text-muted)] mt-2 tabular-nums">{battleData?.amount}€</p>
            </div>
            <button 
              onClick={() => { activeBattleId && cancelClickBattle(activeBattleId); resetGame(); }}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            >
              annuler
            </button>
          </div>
        )}

        {/* READY VIEW - waiting for both players to click ready */}
        {(gameState === "ready" || gameState === "ready_waiting") && (
          <div className="flex-1 flex flex-col items-center justify-center gap-8">
            <div className="text-center">
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-2">click battle</p>
              <h2 className="text-2xl font-light">vs {getOpponentName().toLowerCase()}</h2>
              <p className="text-xs text-[var(--text-muted)] mt-2 tabular-nums">{battleData?.amount}€ chacun</p>
            </div>

            {/* Ready status */}
            <div className="flex gap-8 text-center">
              <div className={`p-4 border ${imReady ? 'border-green-500/50 text-green-400' : 'border-[var(--line)] text-[var(--text-muted)]'}`}>
                <p className="text-xs uppercase tracking-widest mb-1">toi</p>
                <p className="text-sm">{imReady ? 'pret' : 'en attente'}</p>
              </div>
              <div className={`p-4 border ${opponentReady ? 'border-green-500/50 text-green-400' : 'border-[var(--line)] text-[var(--text-muted)]'}`}>
                <p className="text-xs uppercase tracking-widest mb-1">{getOpponentName().toLowerCase()}</p>
                <p className="text-sm">{opponentReady ? 'pret' : 'en attente'}</p>
              </div>
            </div>
            
            {!imReady ? (
              <button
                onClick={handleStart}
                className="px-8 py-4 border border-[var(--line)] hover:border-[var(--text)] hover:bg-[rgba(255,255,255,0.03)]
                  text-sm uppercase tracking-widest transition-all"
              >
                pret
              </button>
            ) : (
              <p className="text-xs text-[var(--text-muted)] animate-pulse">
                attente de l&apos;adversaire...
              </p>
            )}
          </div>
        )}

        {/* COUNTDOWN VIEW */}
        {gameState === "countdown" && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="text-[8rem] md:text-[12rem] font-light leading-none tabular-nums">
              {countdown > 0 ? countdown : "go"}
            </div>
          </div>
        )}

        {/* PLAYING VIEW */}
        {gameState === "playing" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6">
            {/* Timer */}
            <div className="w-full max-w-md">
              <div className="h-1 bg-[var(--line)] overflow-hidden">
                <div 
                  className="h-full bg-[var(--text)] transition-all duration-100 ease-linear"
                  style={{ width: `${(timeLeft / 10) * 100}%` }}
                />
              </div>
              <div className="text-center mt-2 text-sm tabular-nums text-[var(--text-muted)]">
                {timeLeft.toFixed(1)}s
              </div>
            </div>

            {/* Click area */}
            <button
              ref={clickButtonRef}
              onClick={handleGameClick}
              className="w-48 h-48 md:w-64 md:h-64 border border-[var(--line)] hover:border-[var(--text)]
                flex flex-col items-center justify-center transition-all duration-75 
                select-none touch-manipulation active:bg-[rgba(255,255,255,0.05)]"
            >
              <span className="text-5xl md:text-6xl font-light tabular-nums">{localClicks}</span>
              <span className="text-xs text-[var(--text-muted)] mt-2 uppercase tracking-widest">clics</span>
            </button>
          </div>
        )}

        {/* SUBMITTING VIEW */}
        {gameState === "submitting" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-6 h-6 border border-[var(--line)] border-t-[var(--text)] rounded-full animate-spin" />
            <p className="text-sm text-[var(--text-muted)]">envoi...</p>
            <p className="text-2xl tabular-nums">{localClicks} clics</p>
          </div>
        )}

        {/* REVEALING VIEW */}
        {gameState === "revealing" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-8">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest animate-pulse">revelation</p>
            
            <div className="flex gap-8">
              <div className="text-center p-6 border border-[var(--line)]">
                <p className="text-xs text-[var(--text-muted)] mb-2">toi</p>
                <p className={`text-4xl tabular-nums transition-all duration-500 ${myClicksDisplay !== null ? 'opacity-100' : 'opacity-30'}`}>
                  {myClicksDisplay !== null ? myClicksDisplay : "?"}
                </p>
              </div>
              <div className="text-center p-6 border border-[var(--line)]">
                <p className="text-xs text-[var(--text-muted)] mb-2">{getOpponentName().toLowerCase()}</p>
                <p className={`text-4xl tabular-nums transition-all duration-500 ${opponentClicksDisplay !== null ? 'opacity-100' : 'opacity-30'}`}>
                  {opponentClicksDisplay !== null ? opponentClicksDisplay : "?"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* RESULT VIEW */}
        {gameState === "result" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6">
            <p className={`text-4xl md:text-5xl font-light ${
              isWon === true ? 'text-green-400' : 
              isWon === false ? 'text-red-400' : 
              'text-[var(--text-muted)]'
            }`}>
              {isWon === true ? "victoire" : isWon === false ? "defaite" : "egalite"}
            </p>
            
            <p className={`text-xl tabular-nums ${resultProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {resultProfit > 0 ? "+" : ""}{resultProfit.toFixed(2)}€
            </p>

            <div className="flex gap-8 text-center">
              <div>
                <p className="text-xs text-[var(--text-muted)]">toi</p>
                <p className="text-2xl tabular-nums">{myClicksDisplay}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">{getOpponentName().toLowerCase()}</p>
                <p className="text-2xl tabular-nums text-[var(--text-muted)]">{opponentClicksDisplay}</p>
              </div>
            </div>

            <button 
              onClick={resetGame}
              className="mt-4 px-6 py-2 border border-[var(--line)] hover:border-[var(--text)] hover:bg-[rgba(255,255,255,0.03)]
                text-xs uppercase tracking-widest transition-all"
            >
              retour
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
