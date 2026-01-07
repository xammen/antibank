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
  userBalance: any; // Using any because Decimal type can be tricky in client
  userName: string;
}

type GameState = "idle" | "waiting" | "ready" | "countdown" | "playing" | "submitting" | "revealing" | "result";

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
}

export function ClickBattleClient({ userId, userBalance, userName }: ClickBattleClientProps) {
  const [gameState, setGameState] = useState<GameState>("idle");
  const [activeBattleId, setActiveBattleId] = useState<string | null>(null);
  const [targets, setTargets] = useState<any[]>([]);
  const [pendingChallenges, setPendingChallenges] = useState<any[]>([]);
  const [selectedTarget, setSelectedTarget] = useState("");
  const [betAmount, setBetAmount] = useState("1");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [battleData, setBattleData] = useState<BattleData | null>(null);
  
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
    const interval = setInterval(loadLobbyData, 2000);
    return () => clearInterval(interval);
  }, [loadLobbyData]);

  const pollBattleState = useCallback(async () => {
    if (!activeBattleId) return;

    const res = await getClickBattleState(activeBattleId);
    if (res.success && res.battle) {
      const b = res.battle;
      setBattleData(b as BattleData);

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
      else if (gameState === "ready") {
        if (b.startedAt) {
          // Check if start time is recent enough to show countdown
          const now = Date.now();
          const start = b.startedAt;
          const diff = now - start;
          
          if (diff < 3000) {
             setGameState("countdown");
             setCountdown(3 - Math.floor(diff / 1000));
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
  }, [activeBattleId, gameState]); // Removed localClicks from dependencies

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


  // Handle countdown locally
  useEffect(() => {
    if (gameState !== "countdown") return;
    
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          setGameState("playing");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [gameState]);

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
      // Game starts via polling or immediate startTime
      if (res.startTime) {
         // Optionally set immediately to avoid poll delay
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
  };

  // Render helpers
  const getOpponentName = () => {
    if (!battleData) return "adversaire";
    return battleData.player1Id === userId ? battleData.player2Name : battleData.player1Name;
  };

  if (isLoading && gameState === "idle") {
    return <div className="p-8 text-center text-[var(--text-muted)] animate-pulse">chargement...</div>;
  }

  return (
    <div className="max-w-[800px] w-full mx-auto flex flex-col gap-6 animate-fade-in p-4">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[var(--line)] pb-4">
        <Link
          href="/casino"
          className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-sm"
        >
          &larr; casino
        </Link>
        <h1 className="text-[0.85rem] uppercase tracking-widest font-bold">click battle</h1>
        <div className="text-sm tabular-nums">
           {typeof userBalance === 'object' ? parseFloat(userBalance).toFixed(2) : Number(userBalance).toFixed(2)}€
        </div>
      </header>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-2 text-sm text-center">
          {error}
        </div>
      )}

      {/* IDLE VIEW */}
      {gameState === "idle" && (
        <div className="grid gap-8 md:grid-cols-2">
          {/* Create Challenge */}
          <section className="flex flex-col gap-4 p-6 border border-[var(--line)] bg-[rgba(255,255,255,0.01)]">
            <h2 className="text-[0.75rem] uppercase tracking-widest text-[var(--text-muted)]">lancer un defi</h2>
            
            <div className="flex flex-col gap-3">
              <label className="text-sm text-[var(--text-muted)]">adversaire</label>
              <select 
                className="bg-[#111] border border-[var(--line)] p-2 text-sm text-[var(--text)] rounded outline-none focus:border-[var(--text)]"
                value={selectedTarget}
                onChange={(e) => setSelectedTarget(e.target.value)}
              >
                <option value="">choisir une victime</option>
                {targets.map(t => (
                  <option key={t.id} value={t.id}>{t.discordUsername} ({parseFloat(t.balance).toFixed(2)}€)</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-sm text-[var(--text-muted)]">mise (€)</label>
              <input 
                type="number" 
                min="0.5" 
                max="100" 
                step="0.5"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                className="bg-[#111] border border-[var(--line)] p-2 text-sm text-[var(--text)] rounded outline-none focus:border-[var(--text)]"
              />
            </div>

            <button 
              onClick={handleChallenge}
              disabled={!selectedTarget || parseFloat(betAmount) < 0.5}
              className="mt-2 py-3 bg-[var(--text)] text-[var(--bg)] font-bold uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              defier
            </button>
          </section>

          {/* Pending Challenges */}
          <section className="flex flex-col gap-4">
            <h2 className="text-[0.75rem] uppercase tracking-widest text-[var(--text-muted)]">defis recus</h2>
            
            {pendingChallenges.length === 0 ? (
              <div className="flex-1 flex items-center justify-center border border-dashed border-[var(--line)] p-6 text-[var(--text-muted)] text-sm italic">
                personne ne veut te defier...
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {pendingChallenges.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-4 border border-yellow-500/30 bg-yellow-500/5">
                    <div>
                      <div className="text-sm font-bold text-yellow-400">{c.challengerName}</div>
                      <div className="text-xs text-[var(--text-muted)]">mise: {c.amount.toFixed(2)}€</div>
                    </div>
                    <div className="flex gap-2">
                       <button 
                         onClick={() => handleAccept(c.id)}
                         className="px-3 py-1 bg-yellow-500/20 hover:bg-yellow-500/40 text-yellow-400 text-xs uppercase tracking-wider border border-yellow-500/50 transition-colors"
                       >
                         accepter
                       </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* WAITING VIEW */}
      {gameState === "waiting" && (
        <div className="flex flex-col items-center justify-center py-20 gap-6 border border-[var(--line)] bg-[rgba(255,255,255,0.01)]">
          <div className="w-16 h-16 border-4 border-[var(--line)] border-t-[var(--text)] rounded-full animate-spin"></div>
          <div className="text-center">
            <h2 className="text-xl font-bold uppercase tracking-widest mb-2">en attente</h2>
            <p className="text-[var(--text-muted)]">attente de {getOpponentName()}...</p>
            <p className="text-xs text-[var(--text-muted)] mt-4">mise: {battleData?.amount}€</p>
          </div>
          <button 
            onClick={() => activeBattleId && cancelClickBattle(activeBattleId)}
            className="text-xs text-red-400 hover:text-red-300 underline"
          >
            annuler le defi
          </button>
        </div>
      )}

      {/* READY VIEW */}
      {gameState === "ready" && (
        <div className="flex flex-col items-center justify-center py-20 gap-8 border border-[var(--line)] bg-[rgba(255,255,255,0.01)]">
          <div className="text-center">
             <h2 className="text-4xl font-bold mb-2">VS {getOpponentName()}</h2>
             <p className="text-[var(--text-muted)]">mise: {battleData?.amount}€</p>
          </div>
          
          <button
            onClick={handleStart}
            className="px-12 py-6 bg-green-500 hover:bg-green-400 text-black font-black text-2xl uppercase tracking-widest transform transition-transform active:scale-95 shadow-[0_0_20px_rgba(34,197,94,0.3)]"
          >
            PRET ?
          </button>
          
          <p className="text-xs text-[var(--text-muted)] animate-pulse">
            le premier qui clique lance le compte a rebours
          </p>
        </div>
      )}

      {/* COUNTDOWN VIEW */}
      {gameState === "countdown" && (
        <div className="flex flex-col items-center justify-center py-32">
           <div className="text-[10rem] font-black leading-none text-[var(--text)] animate-pulse">
             {countdown > 0 ? countdown : "GO!"}
           </div>
        </div>
      )}

      {/* PLAYING VIEW */}
      {gameState === "playing" && (
        <div className="flex flex-col items-center gap-4">
           {/* Timer bar */}
           <div className="w-full h-2 bg-[#222] rounded-full overflow-hidden">
             <div 
               className="h-full bg-[var(--text)] transition-all duration-100 ease-linear"
               style={{ width: `${(timeLeft / 10) * 100}%` }}
             ></div>
           </div>
           
           <div className="text-4xl font-mono tabular-nums font-bold mb-4">
             {timeLeft.toFixed(1)}s
           </div>

           <button
             ref={clickButtonRef}
             onClick={handleGameClick}
             className="
               w-64 h-64 md:w-80 md:h-80 rounded-full 
               bg-[#1a1a1a] border-4 border-[var(--line)]
               hover:border-[var(--text)] hover:bg-[#222]
               active:bg-[var(--text)] active:text-black
               flex flex-col items-center justify-center
               transition-all duration-75 select-none touch-manipulation
               shadow-[0_0_50px_rgba(0,0,0,0.5)]
             "
           >
             <span className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-2">clics</span>
             <span className="text-6xl font-black tabular-nums">{localClicks}</span>
             <span className="text-xs uppercase tracking-widest text-[var(--text-muted)] mt-2">TAP TAP TAP!</span>
           </button>
        </div>
      )}

      {/* SUBMITTING VIEW */}
      {gameState === "submitting" && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
           <div className="text-[var(--text-muted)] animate-pulse text-xl">envoi du score...</div>
           <div className="text-4xl font-bold">{localClicks} clics</div>
        </div>
      )}

      {/* REVEALING VIEW */}
      {gameState === "revealing" && (
        <div className="flex flex-col items-center justify-center py-10 gap-8 w-full">
           <h2 className="text-2xl uppercase tracking-[0.5em] text-[var(--text-muted)] animate-pulse">revelation</h2>
           
           <div className="grid grid-cols-2 gap-8 w-full max-w-2xl">
              {/* My Score */}
              <div className="flex flex-col items-center p-8 border border-[var(--line)] bg-[rgba(255,255,255,0.02)]">
                 <div className="text-sm text-[var(--text-muted)] mb-4">MOI</div>
                 <div className={`text-6xl font-black tabular-nums transition-all duration-500 ${myClicksDisplay !== null ? 'scale-100 opacity-100' : 'scale-50 opacity-50 blur-sm'}`}>
                    {myClicksDisplay !== null ? myClicksDisplay : "???"}
                 </div>
              </div>

              {/* Opponent Score */}
              <div className="flex flex-col items-center p-8 border border-[var(--line)] bg-[rgba(255,255,255,0.02)]">
                 <div className="text-sm text-[var(--text-muted)] mb-4">{getOpponentName()}</div>
                 <div className={`text-6xl font-black tabular-nums transition-all duration-500 ${opponentClicksDisplay !== null ? 'scale-100 opacity-100' : 'scale-50 opacity-50 blur-sm'}`}>
                    {opponentClicksDisplay !== null ? opponentClicksDisplay : "???"}
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* RESULT VIEW */}
      {gameState === "result" && (
        <div className="flex flex-col items-center justify-center py-10 gap-8 animate-scale-in">
           <div className={`
             text-6xl md:text-8xl font-black uppercase tracking-tighter transform -rotate-2
             ${isWon === true ? 'text-green-500 drop-shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 
               isWon === false ? 'text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 
               'text-yellow-500'}
           `}>
             {isWon === true ? "VICTOIRE" : isWon === false ? "DEFAITE" : "EGALITE"}
           </div>
           
           <div className="text-2xl font-mono">
             {resultProfit > 0 ? "+" : ""}{resultProfit.toFixed(2)}€
           </div>

           <div className="grid grid-cols-2 gap-12 text-center">
             <div>
               <div className="text-xs text-[var(--text-muted)]">moi</div>
               <div className="text-4xl font-bold">{myClicksDisplay}</div>
             </div>
             <div>
               <div className="text-xs text-[var(--text-muted)]">{getOpponentName()}</div>
               <div className="text-4xl font-bold text-[var(--text-muted)]">{opponentClicksDisplay}</div>
             </div>
           </div>

           <button 
             onClick={resetGame}
             className="mt-8 px-8 py-3 border border-[var(--line)] hover:border-[var(--text)] hover:bg-[rgba(255,255,255,0.05)] uppercase tracking-widest transition-all"
           >
             retour
           </button>
        </div>
      )}
    </div>
  );
}
