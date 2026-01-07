"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { playDiceVsBot, type PlayVsBotResult, getAvailablePlayers, getPendingDiceChallenges, createDiceChallenge, acceptDiceChallenge } from "@/actions/dice";
import { Balance } from "@/components/balance";
import { BalanceProvider, useBalance } from "@/hooks/use-balance";

interface DiceGameClientProps {
  userBalance: string;
  userName: string;
}

type GameMode = "bot" | "pvp";

const DICE_FACES = ["\u2680", "\u2681", "\u2682", "\u2683", "\u2684", "\u2685"];

function AnimatedDice({ 
  finalValue, 
  isRolling, 
  delay = 0 
}: { 
  finalValue: number | null; 
  isRolling: boolean;
  delay?: number;
}) {
  const [displayValue, setDisplayValue] = useState<string>(DICE_FACES[0]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isRolling) {
      timeoutRef.current = setTimeout(() => {
        let speed = 50;
        let iterations = 0;
        const maxIterations = 20 + Math.random() * 10;

        const roll = () => {
          setDisplayValue(DICE_FACES[Math.floor(Math.random() * 6)]);
          iterations++;

          if (iterations < maxIterations) {
            speed = 50 + (iterations * 15);
            intervalRef.current = setTimeout(roll, speed);
          } else if (finalValue) {
            setDisplayValue(DICE_FACES[finalValue - 1]);
          }
        };

        roll();
      }, delay);
    } else if (finalValue) {
      setDisplayValue(DICE_FACES[finalValue - 1]);
    } else {
      setDisplayValue(DICE_FACES[0]);
    }

    return () => {
      if (intervalRef.current) clearTimeout(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isRolling, finalValue, delay]);

  return <span className="select-none">{displayValue}</span>;
}

interface Player {
  id: string;
  name: string;
  balance: number;
}

interface Challenge {
  id: string;
  amount: unknown;
  player1?: { id: string; discordUsername: string } | null;
  player2?: { id: string; discordUsername: string } | null;
}

function DiceGameInner({ userBalance, userName }: DiceGameClientProps) {
  const [mode, setMode] = useState<GameMode>("bot");
  const [betAmount, setBetAmount] = useState("1");
  const [isPlaying, setIsPlaying] = useState(false);
  const [result, setResult] = useState<PlayVsBotResult | null>(null);
  const [showAnimation, setShowAnimation] = useState(false);
  const { refreshBalance } = useBalance(userBalance);

  // PvP state
  const [players, setPlayers] = useState<Player[]>([]);
  const [challenges, setChallenges] = useState<{ sent: Challenge[]; received: Challenge[] }>({ sent: [], received: [] });
  const [pvpResult, setPvpResult] = useState<{ won: boolean; tie: boolean; myRoll: number; theirRoll: number; myDice: [number, number]; theirDice: [number, number]; profit: number } | null>(null);
  const [pvpAnimating, setPvpAnimating] = useState(false);

  useEffect(() => {
    if (mode === "pvp") {
      loadPvpData();
      const interval = setInterval(loadPvpData, 5000);
      return () => clearInterval(interval);
    }
  }, [mode]);

  const loadPvpData = async () => {
    const [p, c] = await Promise.all([
      getAvailablePlayers(),
      getPendingDiceChallenges(),
    ]);
    setPlayers(p);
    setChallenges(c as { sent: Challenge[]; received: Challenge[] });
  };

  const handlePlayBot = async () => {
    const amount = parseFloat(betAmount);
    if (isNaN(amount) || amount < 0.5) return;

    setIsPlaying(true);
    setResult(null);
    setShowAnimation(true);

    const res = await playDiceVsBot(amount);
    setResult(res);
    
    await new Promise((r) => setTimeout(r, 1800));
    
    setShowAnimation(false);
    setIsPlaying(false);
    
    if (res.success) {
      refreshBalance();
    }
  };

  const handleChallenge = async (player: Player) => {
    const amount = parseFloat(betAmount);
    if (isNaN(amount) || amount < 0.5) return;

    setIsPlaying(true);
    await createDiceChallenge(player.id, amount);
    setIsPlaying(false);
    loadPvpData();
  };

  const handleAccept = async (challenge: Challenge) => {
    setIsPlaying(true);
    setPvpResult(null);
    setPvpAnimating(true);

    // Appeler l'action immédiatement mais garder l'animation
    const res = await acceptDiceChallenge(challenge.id);

    if (res.success) {
      // Stocker le résultat avec les dés pour l'animation
      setPvpResult({
        won: res.winnerId === undefined ? false : res.profit! > 0,
        tie: res.winnerId === null,
        myRoll: res.player2Roll!,
        theirRoll: res.player1Roll!,
        myDice: res.player2Dice!,
        theirDice: res.player1Dice!,
        profit: res.profit!,
      });
      
      // Laisser l'animation jouer pendant 2s
      await new Promise((r) => setTimeout(r, 2000));
      setPvpAnimating(false);
      
      refreshBalance();
      loadPvpData();
    } else {
      setPvpAnimating(false);
    }
    
    setIsPlaying(false);
  };

  const gameStatus = result 
    ? result.won 
      ? "win" 
      : result.tie 
        ? "tie" 
        : "lose"
    : "idle";

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
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm text-[var(--text-muted)]">dice</span>
          </div>
        </div>
        <div className="text-sm text-[var(--text-muted)]">
          {userName.toLowerCase()}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row">
        
        {/* Game area */}
        <div className="flex-1 h-[50vh] lg:h-auto relative flex items-center justify-center bg-[rgba(255,255,255,0.01)]">
          
          {mode === "bot" ? (
            <div className="flex flex-col items-center gap-8">
              {/* Dice arena */}
              <div className="flex items-center gap-8 lg:gap-16">
                {/* Player side */}
                <div className="flex flex-col items-center gap-4">
                  <span className="text-[0.65rem] uppercase tracking-[0.2em] text-[var(--text-muted)]">toi</span>
                  <div className="flex gap-2 text-6xl lg:text-8xl">
                    <AnimatedDice 
                      finalValue={result?.playerDice?.[0] ?? null} 
                      isRolling={showAnimation} 
                      delay={0}
                    />
                    <AnimatedDice 
                      finalValue={result?.playerDice?.[1] ?? null} 
                      isRolling={showAnimation} 
                      delay={100}
                    />
                  </div>
                  {result?.playerRoll && !showAnimation && (
                    <span className="text-4xl font-mono font-bold">{result.playerRoll}</span>
                  )}
                  {showAnimation && <span className="text-4xl font-mono opacity-20">--</span>}
                </div>

                {/* VS divider */}
                <div className="flex flex-col items-center gap-2">
                  <div className="w-px h-16 bg-[var(--line)]" />
                  <span className="text-xs text-[var(--text-muted)] font-light">vs</span>
                  <div className="w-px h-16 bg-[var(--line)]" />
                </div>

                {/* Bot side */}
                <div className="flex flex-col items-center gap-4">
                  <span className="text-[0.65rem] uppercase tracking-[0.2em] text-[var(--text-muted)]">bot</span>
                  <div className="flex gap-2 text-6xl lg:text-8xl">
                    <AnimatedDice 
                      finalValue={result?.botDice?.[0] ?? null} 
                      isRolling={showAnimation} 
                      delay={200}
                    />
                    <AnimatedDice 
                      finalValue={result?.botDice?.[1] ?? null} 
                      isRolling={showAnimation} 
                      delay={300}
                    />
                  </div>
                  {result?.botRoll && !showAnimation && (
                    <span className="text-4xl font-mono font-bold">{result.botRoll}</span>
                  )}
                  {showAnimation && <span className="text-4xl font-mono opacity-20">--</span>}
                </div>
              </div>

              {/* Result banner */}
              {result && result.success && !showAnimation && (
                <div className={`px-8 py-3 ${
                  gameStatus === "win" 
                    ? "bg-green-500/10 border border-green-500/30" 
                    : gameStatus === "tie"
                      ? "bg-yellow-500/10 border border-yellow-500/30"
                      : "bg-red-500/10 border border-red-500/30"
                }`}>
                  <span className={`text-sm font-mono ${
                    gameStatus === "win" 
                      ? "text-green-400" 
                      : gameStatus === "tie"
                        ? "text-yellow-400"
                        : "text-red-400"
                  }`}>
                    {gameStatus === "win" && "+"}
                    {result.profit?.toFixed(2)}e
                  </span>
                </div>
              )}

              {result && !result.success && (
                <div className="px-8 py-3 bg-red-500/10 border border-red-500/30">
                  <span className="text-sm text-red-400">{result.error}</span>
                </div>
              )}
            </div>
          ) : (
            /* PvP View */
            <div className="w-full max-w-md px-6">
              {pvpResult ? (
                <div className="flex flex-col items-center gap-8">
                  {/* Dice arena PvP */}
                  <div className="flex items-center gap-8 lg:gap-16">
                    {/* My side (player2) */}
                    <div className="flex flex-col items-center gap-4">
                      <span className="text-[0.65rem] uppercase tracking-[0.2em] text-[var(--text-muted)]">toi</span>
                      <div className="flex gap-2 text-6xl lg:text-8xl">
                        <AnimatedDice 
                          finalValue={pvpResult.myDice[0]} 
                          isRolling={pvpAnimating} 
                          delay={0}
                        />
                        <AnimatedDice 
                          finalValue={pvpResult.myDice[1]} 
                          isRolling={pvpAnimating} 
                          delay={100}
                        />
                      </div>
                      {!pvpAnimating && (
                        <span className="text-4xl font-mono font-bold">{pvpResult.myRoll}</span>
                      )}
                      {pvpAnimating && <span className="text-4xl font-mono opacity-20">--</span>}
                    </div>

                    {/* VS divider */}
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-px h-16 bg-[var(--line)]" />
                      <span className="text-xs text-[var(--text-muted)] font-light">vs</span>
                      <div className="w-px h-16 bg-[var(--line)]" />
                    </div>

                    {/* Their side (player1) */}
                    <div className="flex flex-col items-center gap-4">
                      <span className="text-[0.65rem] uppercase tracking-[0.2em] text-[var(--text-muted)]">eux</span>
                      <div className="flex gap-2 text-6xl lg:text-8xl">
                        <AnimatedDice 
                          finalValue={pvpResult.theirDice[0]} 
                          isRolling={pvpAnimating} 
                          delay={200}
                        />
                        <AnimatedDice 
                          finalValue={pvpResult.theirDice[1]} 
                          isRolling={pvpAnimating} 
                          delay={300}
                        />
                      </div>
                      {!pvpAnimating && (
                        <span className="text-4xl font-mono font-bold">{pvpResult.theirRoll}</span>
                      )}
                      {pvpAnimating && <span className="text-4xl font-mono opacity-20">--</span>}
                    </div>
                  </div>

                  {/* Result banner */}
                  {!pvpAnimating && (
                    <div className={`px-8 py-3 ${
                      pvpResult.won 
                        ? "bg-green-500/10 border border-green-500/30" 
                        : pvpResult.tie
                          ? "bg-yellow-500/10 border border-yellow-500/30"
                          : "bg-red-500/10 border border-red-500/30"
                    }`}>
                      <span className={`text-sm font-mono ${
                        pvpResult.won 
                          ? "text-green-400" 
                          : pvpResult.tie
                            ? "text-yellow-400"
                            : "text-red-400"
                      }`}>
                        {pvpResult.profit > 0 && "+"}
                        {pvpResult.profit.toFixed(2)}e
                      </span>
                    </div>
                  )}

                  {!pvpAnimating && (
                    <button 
                      onClick={() => setPvpResult(null)}
                      className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
                    >
                      continuer
                    </button>
                  )}
                </div>
              ) : pvpAnimating ? (
                /* Animation en cours sans résultat encore */
                <div className="flex flex-col items-center gap-8">
                  <div className="flex items-center gap-8 lg:gap-16">
                    <div className="flex flex-col items-center gap-4">
                      <span className="text-[0.65rem] uppercase tracking-[0.2em] text-[var(--text-muted)]">toi</span>
                      <div className="flex gap-2 text-6xl lg:text-8xl">
                        <AnimatedDice finalValue={null} isRolling={true} delay={0} />
                        <AnimatedDice finalValue={null} isRolling={true} delay={100} />
                      </div>
                      <span className="text-4xl font-mono opacity-20">--</span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-px h-16 bg-[var(--line)]" />
                      <span className="text-xs text-[var(--text-muted)] font-light">vs</span>
                      <div className="w-px h-16 bg-[var(--line)]" />
                    </div>
                    <div className="flex flex-col items-center gap-4">
                      <span className="text-[0.65rem] uppercase tracking-[0.2em] text-[var(--text-muted)]">eux</span>
                      <div className="flex gap-2 text-6xl lg:text-8xl">
                        <AnimatedDice finalValue={null} isRolling={true} delay={200} />
                        <AnimatedDice finalValue={null} isRolling={true} delay={300} />
                      </div>
                      <span className="text-4xl font-mono opacity-20">--</span>
                    </div>
                  </div>
                </div>
              ) : challenges.received.length > 0 || challenges.sent.length > 0 ? (
                <div className="space-y-6">
                  {challenges.received.length > 0 && (
                    <div>
                      <p className="text-[0.65rem] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-3">
                        defis recus
                      </p>
                      {challenges.received.map((c) => (
                        <div key={c.id} className="flex items-center justify-between p-4 border border-[var(--line)] mb-2">
                          <div>
                            <p className="text-sm">{c.player1?.discordUsername?.toLowerCase()}</p>
                            <p className="text-xs text-[var(--text-muted)] font-mono">{String(c.amount)}e</p>
                          </div>
                          <button
                            onClick={() => handleAccept(c)}
                            disabled={isPlaying}
                            className="px-4 py-2 text-xs uppercase tracking-wider bg-green-500/20 text-green-400 border border-green-500/50 hover:bg-green-500/30 disabled:opacity-50"
                          >
                            jouer
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {challenges.sent.length > 0 && (
                    <div>
                      <p className="text-[0.65rem] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-3">
                        en attente
                      </p>
                      {challenges.sent.map((c) => (
                        <div key={c.id} className="flex items-center justify-between p-4 border border-[var(--line)] opacity-60 mb-2">
                          <div>
                            <p className="text-sm">{c.player2?.discordUsername?.toLowerCase()}</p>
                            <p className="text-xs text-[var(--text-muted)] font-mono">{String(c.amount)}e</p>
                          </div>
                          <span className="text-xs text-[var(--text-muted)]">...</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-[var(--text-muted)]">
                  <p className="text-4xl mb-4 opacity-20">{"\uD83C\uDFB2"}</p>
                  <p className="text-sm">defie un joueur depuis le panel</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-[var(--line)] flex flex-col">
          
          {/* Balance */}
          <div className="p-4 border-b border-[var(--line)]">
            <Balance initialBalance={userBalance} />
          </div>

          {/* Mode toggle */}
          <div className="flex border-b border-[var(--line)]">
            <button
              onClick={() => { setMode("bot"); setResult(null); }}
              className={`flex-1 py-2.5 text-[0.65rem] uppercase tracking-[0.15em] transition-colors ${
                mode === "bot" 
                  ? "text-[var(--text)] bg-[rgba(255,255,255,0.03)]" 
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              vs bot
            </button>
            <button
              onClick={() => { setMode("pvp"); setResult(null); setPvpResult(null); }}
              className={`flex-1 py-2.5 text-[0.65rem] uppercase tracking-[0.15em] transition-colors ${
                mode === "pvp" 
                  ? "text-[var(--text)] bg-[rgba(255,255,255,0.03)]" 
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              vs joueur
            </button>
          </div>

          {/* Bet controls */}
          <div className="p-4 flex-1">
            <p className="text-[0.65rem] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-3">mise</p>
            
            <div className="flex items-center gap-2 mb-3">
              <input
                type="number"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                min="0.5"
                step="0.5"
                disabled={isPlaying}
                className="flex-1 px-3 py-2.5 bg-transparent border border-[var(--line)] text-center font-mono focus:outline-none focus:border-[var(--text-muted)] disabled:opacity-50"
              />
              <span className="text-[var(--text-muted)] text-sm">e</span>
            </div>

            <div className="grid grid-cols-4 gap-1.5 mb-4">
              {[0.5, 1, 2, 5].map((v) => (
                <button
                  key={v}
                  onClick={() => setBetAmount(v.toString())}
                  disabled={isPlaying}
                  className="py-1.5 text-[0.65rem] border border-[var(--line)] hover:border-[var(--text-muted)] disabled:opacity-50 transition-colors font-mono"
                >
                  {v}
                </button>
              ))}
            </div>

            {mode === "bot" ? (
              <button
                onClick={handlePlayBot}
                disabled={isPlaying || parseFloat(betAmount) < 0.5}
                className="w-full py-3 bg-[var(--text)] text-[var(--bg)] text-xs uppercase tracking-[0.15em] hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {isPlaying ? "..." : "lancer"}
              </button>
            ) : (
              /* Player list for challenges */
              <div>
                <p className="text-[0.65rem] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2 mt-2">joueurs</p>
                <div className="flex flex-col gap-1.5 max-h-[200px] overflow-auto">
                  {players.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)] text-center py-4">aucun</p>
                  ) : (
                    players.map((p) => (
                      <div key={p.id} className="flex items-center justify-between p-2 border border-[var(--line)] hover:border-[var(--text-muted)] transition-colors">
                        <div className="min-w-0">
                          <p className="text-xs truncate">{p.name.toLowerCase()}</p>
                          <p className="text-[0.6rem] text-[var(--text-muted)] font-mono">{p.balance.toFixed(0)}e</p>
                        </div>
                        <button
                          onClick={() => handleChallenge(p)}
                          disabled={isPlaying || parseFloat(betAmount) < 0.5}
                          className="px-2 py-1 text-[0.6rem] uppercase border border-[var(--line)] hover:border-[var(--text-muted)] disabled:opacity-50"
                        >
                          go
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Rules */}
          <div className="p-4 border-t border-[var(--line)] text-[0.6rem] text-[var(--text-muted)] space-y-0.5">
            <p>2d6 chacun</p>
            <p>plus haut score gagne x1.9</p>
            <p>egalite rembourse -5%</p>
          </div>
        </div>
      </div>
    </main>
  );
}

export function DiceGameClient({ userBalance, userName }: DiceGameClientProps) {
  return (
    <BalanceProvider initialBalance={userBalance}>
      <DiceGameInner userBalance={userBalance} userName={userName} />
    </BalanceProvider>
  );
}
