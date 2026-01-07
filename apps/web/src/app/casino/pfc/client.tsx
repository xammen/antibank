"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { playPFCVsBot, type PlayPFCVsBotResult, getPendingPFCChallenges, createPFCChallenge, acceptPFCChallenge, makePFCChoice, getRecentPFCResults, getPFCHistory } from "@/actions/pfc";
import { getAvailablePlayers } from "@/actions/dice";
import { type PFCChoice } from "@/lib/pfc";
import { Balance } from "@/components/balance";
import { BalanceProvider, useBalance } from "@/hooks/use-balance";
import { ChallengeNotification } from "@/components/challenge-notification";

interface PFCGameClientProps {
  userBalance: string;
  userName: string;
}

type GameMode = "bot" | "pvp";

const CHOICES: { choice: PFCChoice; emoji: string }[] = [
  { choice: "pierre", emoji: "🪨" },
  { choice: "feuille", emoji: "📄" },
  { choice: "ciseaux", emoji: "✂️" },
];

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

interface PlayingGame extends Challenge {
  player1Choice?: string | null;
  player2Choice?: string | null;
}

interface HistoryGame {
  id: string;
  myChoice: string | null;
  theirChoice: string | null;
  opponentName: string;
  won: boolean;
  tie: boolean;
  profit: number;
  amount: number;
  completedAt: Date | null;
}

interface RecentResult {
  id: string;
  myChoice: string | null;
  theirChoice: string | null;
  opponentName: string;
  won: boolean;
  tie: boolean;
  profit: number;
}

function PFCGameInner({ userBalance, userName }: PFCGameClientProps) {
  const [mode, setMode] = useState<GameMode>("bot");
  const [betAmount, setBetAmount] = useState("1");
  const [isPlaying, setIsPlaying] = useState(false);
  const [result, setResult] = useState<PlayPFCVsBotResult | null>(null);
  const [showAnimation, setShowAnimation] = useState(false);
  const [playerChoice, setPlayerChoice] = useState<PFCChoice | null>(null);
  const [animatedEmoji, setAnimatedEmoji] = useState("\uD83E\uDD14");
  const { refreshBalance } = useBalance(userBalance);

  // PvP state
  const [players, setPlayers] = useState<Player[]>([]);
  const [challenges, setChallenges] = useState<{ sent: Challenge[]; received: Challenge[]; playing: PlayingGame[]; waitingResult: PlayingGame[] }>({ sent: [], received: [], playing: [], waitingResult: [] });
  const [pvpResult, setPvpResult] = useState<{ won: boolean; tie: boolean; myChoice: string; theirChoice: string; profit: number } | null>(null);
  const [history, setHistory] = useState<HistoryGame[]>([]);
  const [seenResultIds, setSeenResultIds] = useState<Set<string>>(new Set());

  // Always poll for challenges (even in bot mode, to show notifications)
  useEffect(() => {
    loadPvpData();
    const interval = setInterval(loadPvpData, 3000);
    return () => clearInterval(interval);
  }, []);

  // Load history on mount and refresh periodically
  useEffect(() => {
    const loadHistory = async () => {
      const h = await getPFCHistory(15);
      setHistory(h as HistoryGame[]);
    };
    loadHistory();
    const interval = setInterval(loadHistory, 5000);
    return () => clearInterval(interval);
  }, []);

  // Poll for results when waiting (either waiting for opponent to choose, or waiting for opponent to accept and play)
  useEffect(() => {
    if (challenges.waitingResult.length === 0 && challenges.sent.length === 0) return;

    const checkResults = async () => {
      const results = await getRecentPFCResults();
      for (const result of results as RecentResult[]) {
        if (!seenResultIds.has(result.id)) {
          // New result! Show it
          setPvpResult({
            won: result.won,
            tie: result.tie,
            myChoice: result.myChoice || "",
            theirChoice: result.theirChoice || "",
            profit: result.profit,
          });
          setSeenResultIds(prev => new Set([...prev, result.id]));
          refreshBalance();
          loadPvpData();
          // Reload history
          const h = await getPFCHistory(15);
          setHistory(h as HistoryGame[]);
          break;
        }
      }
    };

    const interval = setInterval(checkResults, 2000);
    return () => clearInterval(interval);
  }, [challenges.waitingResult, challenges.sent, seenResultIds, refreshBalance]);

  // Bot thinking animation
  useEffect(() => {
    if (showAnimation) {
      const emojis = ["🤔", "🪨", "📄", "✂️"];
      let i = 0;
      const interval = setInterval(() => {
        i = (i + 1) % emojis.length;
        setAnimatedEmoji(emojis[i]);
      }, 150);
      return () => clearInterval(interval);
    }
  }, [showAnimation]);

  const loadPvpData = async () => {
    const [p, c] = await Promise.all([
      getAvailablePlayers(),
      getPendingPFCChallenges(),
    ]);
    setPlayers(p);
    setChallenges(c as { sent: Challenge[]; received: Challenge[]; playing: PlayingGame[]; waitingResult: PlayingGame[] });
  };

  const getEmoji = (choice: PFCChoice | string) => {
    return CHOICES.find((c) => c.choice === choice)?.emoji || "";
  };

  const handlePlayBot = async (choice: PFCChoice) => {
    const amount = parseFloat(betAmount);
    if (isNaN(amount) || amount < 0.5) return;

    setIsPlaying(true);
    setResult(null);
    setPlayerChoice(choice);
    setShowAnimation(true);

    const res = await playPFCVsBot(choice, amount);
    
    await new Promise((r) => setTimeout(r, 1200));
    
    setResult(res);
    setShowAnimation(false);
    setIsPlaying(false);

    if (res.success) {
      refreshBalance();
      // Reload history
      const h = await getPFCHistory(15);
      setHistory(h as HistoryGame[]);
    }
  };

  const handleChallenge = async (player: Player) => {
    const amount = parseFloat(betAmount);
    if (isNaN(amount) || amount < 0.5) return;

    setIsPlaying(true);
    await createPFCChallenge(player.id, amount);
    setIsPlaying(false);
    loadPvpData();
  };

  const handleAccept = async (challenge: Challenge) => {
    setIsPlaying(true);
    await acceptPFCChallenge(challenge.id);
    setIsPlaying(false);
    refreshBalance();
    loadPvpData();
  };

  const handlePvPChoice = async (game: PlayingGame, choice: PFCChoice) => {
    setIsPlaying(true);
    setShowAnimation(true);
    setPlayerChoice(choice);

    await new Promise((r) => setTimeout(r, 800));

    const res = await makePFCChoice(game.id, choice);
    setShowAnimation(false);
    setIsPlaying(false);

    if (res.success && !res.waiting) {
      setPvpResult({
        won: res.profit! > 0,
        tie: res.winnerId === null,
        myChoice: choice,
        theirChoice: res.player1Choice === choice ? res.player2Choice! : res.player1Choice!,
        profit: res.profit!,
      });
      refreshBalance();
      // Reload history
      const h = await getPFCHistory(15);
      setHistory(h as HistoryGame[]);
    }
    loadPvpData();
  };

  const reset = () => {
    setResult(null);
    setPlayerChoice(null);
    setPvpResult(null);
  };

  const gameStatus = result 
    ? result.won 
      ? "win" 
      : result.tie 
        ? "tie" 
        : "lose"
    : "idle";

  // Handle challenge notification accept
  const handleNotificationAccept = async (challenge: { id: string; amount: number | string; gameType: "dice" | "pfc"; challenger: string }) => {
    // Switch to PvP mode and accept the challenge
    setMode("pvp");
    const matchingChallenge = challenges.received.find(c => c.id === challenge.id);
    if (matchingChallenge) {
      await handleAccept(matchingChallenge);
    }
  };

  // Handle challenge notification dismiss (just hide it, don't cancel)
  const handleNotificationDismiss = () => {
    // Just dismisses the notification, challenge stays pending
  };

  // Format challenges for notification component
  const notificationChallenges = challenges.received.map(c => ({
    id: c.id,
    amount: c.amount as number,
    gameType: "pfc" as const,
    challenger: c.player1?.discordUsername || "???",
  }));

  return (
    <>
      {/* Challenge notifications */}
      <ChallengeNotification
        challenges={notificationChallenges}
        onAccept={handleNotificationAccept}
        onDismiss={handleNotificationDismiss}
      />

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
            <span className="text-sm text-[var(--text-muted)]">pfc</span>
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
              
              {/* Show choice buttons if no result */}
              {!result && !playerChoice && (
                <div className="flex flex-col items-center gap-6">
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-[var(--text-muted)]">choisis</p>
                  <div className="flex gap-4">
                    {CHOICES.map(({ choice, emoji }) => (
                      <button
                        key={choice}
                        onClick={() => handlePlayBot(choice)}
                        disabled={isPlaying || parseFloat(betAmount) < 0.5}
                        className="w-24 h-24 lg:w-28 lg:h-28 flex items-center justify-center text-5xl lg:text-6xl border border-[var(--line)] hover:border-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.02)] disabled:opacity-50 transition-all"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Arena view when playing/result */}
              {(playerChoice || result) && (
                <>
                  <div className="flex items-center gap-8 lg:gap-16">
                    {/* Player side */}
                    <div className="flex flex-col items-center gap-4">
                      <span className="text-[0.65rem] uppercase tracking-[0.2em] text-[var(--text-muted)]">toi</span>
                      <div className="w-24 h-24 lg:w-28 lg:h-28 flex items-center justify-center text-5xl lg:text-6xl border border-[var(--line)]">
                        {playerChoice ? getEmoji(playerChoice) : "?"}
                      </div>
                    </div>

                    {/* VS divider */}
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-px h-12 bg-[var(--line)]" />
                      <span className="text-xs text-[var(--text-muted)] font-light">vs</span>
                      <div className="w-px h-12 bg-[var(--line)]" />
                    </div>

                    {/* Bot side */}
                    <div className="flex flex-col items-center gap-4">
                      <span className="text-[0.65rem] uppercase tracking-[0.2em] text-[var(--text-muted)]">bot</span>
                      <div className={`w-24 h-24 lg:w-28 lg:h-28 flex items-center justify-center text-5xl lg:text-6xl border border-[var(--line)] ${showAnimation ? "animate-pulse" : ""}`}>
                        {result?.botChoice ? getEmoji(result.botChoice) : animatedEmoji}
                      </div>
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

                  {/* Replay button */}
                  {result && !showAnimation && (
                    <button 
                      onClick={reset}
                      className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                    >
                      rejouer
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            /* PvP View */
            <div className="w-full max-w-md px-6">
              
              {/* Games waiting for my choice */}
              {challenges.playing.length > 0 && !pvpResult && (
                <div className="flex flex-col items-center gap-6">
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-yellow-400">a toi de jouer</p>
                  {challenges.playing.map((g) => (
                    <div key={g.id} className="text-center">
                      <p className="text-sm mb-4">
                        vs {g.player1?.discordUsername?.toLowerCase() || g.player2?.discordUsername?.toLowerCase()} 
                        <span className="text-[var(--text-muted)] ml-2">({String(g.amount)}e)</span>
                      </p>
                      <div className="flex gap-3">
                        {CHOICES.map(({ choice, emoji }) => (
                          <button
                            key={choice}
                            onClick={() => handlePvPChoice(g, choice)}
                            disabled={isPlaying}
                            className="w-20 h-20 flex items-center justify-center text-4xl border border-[var(--line)] hover:border-yellow-500/50 hover:bg-yellow-500/10 disabled:opacity-50 transition-all"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {pvpResult && (
                <div className="flex flex-col items-center gap-6">
                  <div className="text-6xl">
                    {pvpResult.won ? "\uD83C\uDFC6" : pvpResult.tie ? "\uD83E\uDD1D" : "\uD83D\uDCA8"}
                  </div>
                  <div className="text-center">
                    <p className="text-3xl mb-2">
                      {getEmoji(pvpResult.myChoice)} vs {getEmoji(pvpResult.theirChoice)}
                    </p>
                    <p className={`text-lg font-mono ${
                      pvpResult.won ? "text-green-400" : pvpResult.tie ? "text-yellow-400" : "text-red-400"
                    }`}>
                      {pvpResult.profit > 0 ? "+" : ""}{pvpResult.profit.toFixed(2)}e
                    </p>
                  </div>
                  <button 
                    onClick={reset}
                    className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
                  >
                    continuer
                  </button>
                </div>
              )}

              {challenges.playing.length === 0 && !pvpResult && (
                <>
                  {/* Waiting for opponent to choose */}
                  {challenges.waitingResult.length > 0 && (
                    <div className="mb-6">
                      <p className="text-[0.65rem] uppercase tracking-[0.2em] text-yellow-400 mb-3">
                        en attente de l'adversaire
                      </p>
                      {challenges.waitingResult.map((g) => (
                        <div key={g.id} className="flex items-center justify-between p-4 border border-yellow-500/30 bg-yellow-500/10 mb-2">
                          <div>
                            <p className="text-sm">{g.player1?.discordUsername?.toLowerCase() || g.player2?.discordUsername?.toLowerCase()}</p>
                            <p className="text-xs text-[var(--text-muted)] font-mono">{String(g.amount)}e</p>
                          </div>
                          <span className="text-xs text-yellow-400 animate-pulse">...</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {challenges.received.length > 0 || challenges.sent.length > 0 ? (
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
                  ) : challenges.waitingResult.length === 0 && (
                    <div className="text-center text-[var(--text-muted)]">
                      <div className="text-4xl mb-4 opacity-20 flex justify-center gap-2">
                        <span>🪨</span>
                        <span>📄</span>
                        <span>✂️</span>
                      </div>
                      <p className="text-sm">defie un joueur depuis le panel</p>
                    </div>
                  )}
                </>
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
              onClick={() => { setMode("bot"); reset(); }}
              className={`flex-1 py-2.5 text-[0.65rem] uppercase tracking-[0.15em] transition-colors ${
                mode === "bot" 
                  ? "text-[var(--text)] bg-[rgba(255,255,255,0.03)]" 
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              vs bot
            </button>
            <button
              onClick={() => { setMode("pvp"); reset(); }}
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

            {mode === "pvp" && (
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

          {/* History */}
          {history.length > 0 && (
            <div className="border-t border-[var(--line)] max-h-48 overflow-y-auto">
              <div className="p-3 border-b border-[var(--line)] sticky top-0 bg-[var(--bg)]">
                <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)]">historique</p>
              </div>
              <div className="divide-y divide-[var(--line)]">
                {history.map((game) => (
                  <div 
                    key={game.id} 
                    className={`px-3 py-2 flex items-center justify-between ${
                      game.won ? "bg-green-500/5" : game.tie ? "bg-yellow-500/5" : "bg-red-500/5"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getEmoji(game.myChoice || "")}</span>
                      <span className="text-[var(--text-muted)]">vs</span>
                      <span className="text-lg">{getEmoji(game.theirChoice || "")}</span>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-mono ${
                        game.won ? "text-green-400" : game.tie ? "text-yellow-400" : "text-red-400"
                      }`}>
                        {game.profit > 0 ? "+" : ""}{game.profit.toFixed(2)}e
                      </p>
                      <p className="text-[0.55rem] text-[var(--text-muted)]">
                        {game.opponentName?.toLowerCase()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rules */}
          <div className="p-4 border-t border-[var(--line)] text-[0.6rem] text-[var(--text-muted)] space-y-0.5">
            <p>pierre &gt; ciseaux</p>
            <p>ciseaux &gt; feuille</p>
            <p>feuille &gt; pierre</p>
            <p className="pt-1">victoire x1.9 | egalite -5%</p>
          </div>
        </div>
      </div>
    </main>
    </>
  );
}

export function PFCGameClient({ userBalance, userName }: PFCGameClientProps) {
  return (
    <BalanceProvider initialBalance={userBalance}>
      <PFCGameInner userBalance={userBalance} userName={userName} />
    </BalanceProvider>
  );
}
