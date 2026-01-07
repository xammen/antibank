"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  getDCState,
  buyDahkaCoin,
  sellDahkaCoin,
  getDCTransactions,
  tickPrice,
} from "@/actions/dahkacoin";

// ============================================
// TYPES
// ============================================

type MarketPhase = 'accumulation' | 'markup' | 'euphoria' | 'distribution' | 'decline' | 'capitulation' | 'recovery';
type MarketEvent = 'none' | 'whale_pump' | 'whale_dump' | 'flash_crash' | 'mega_pump' | 'fomo_wave' | 'panic_wave' | 'short_squeeze' | 'rug_pull' | 'dead_cat_bounce' | 'calm_before_storm' | 'volatility_storm' | 'price_freeze' | 'momentum_flip' | 'mystery_whale' | 'double_or_nothing' | 'golden_hour';

interface DCTransaction {
  id: string;
  type: string;
  dcAmount: number;
  euroAmount: number;
  price: number;
  createdAt: Date;
}

// ============================================
// CONFIG
// ============================================

const PHASE_DISPLAY: Record<MarketPhase, { label: string; risk: string }> = {
  accumulation: { label: 'accumulation', risk: 'low' },
  markup: { label: 'hausse', risk: 'medium' },
  euphoria: { label: 'euphorie', risk: 'extreme' },
  distribution: { label: 'distribution', risk: 'high' },
  decline: { label: 'baisse', risk: 'medium' },
  capitulation: { label: 'capitulation', risk: 'extreme' },
  recovery: { label: 'recuperation', risk: 'low' },
};

const EVENT_DISPLAY: Record<MarketEvent, { label: string; type: 'pump' | 'crash' | 'chaos' | 'none' }> = {
  none: { label: '', type: 'none' },
  whale_pump: { label: 'whale pump', type: 'pump' },
  whale_dump: { label: 'whale dump', type: 'crash' },
  flash_crash: { label: 'flash crash', type: 'crash' },
  mega_pump: { label: 'mega pump', type: 'pump' },
  fomo_wave: { label: 'fomo', type: 'pump' },
  panic_wave: { label: 'panic', type: 'crash' },
  short_squeeze: { label: 'short squeeze', type: 'pump' },
  rug_pull: { label: 'rug pull', type: 'crash' },
  dead_cat_bounce: { label: 'dead cat bounce', type: 'chaos' },
  calm_before_storm: { label: 'calm before storm', type: 'chaos' },
  volatility_storm: { label: 'volatility storm', type: 'chaos' },
  price_freeze: { label: 'price freeze', type: 'chaos' },
  momentum_flip: { label: 'momentum flip', type: 'chaos' },
  mystery_whale: { label: 'mystery whale', type: 'chaos' },
  double_or_nothing: { label: 'double or nothing', type: 'chaos' },
  golden_hour: { label: 'golden hour', type: 'pump' },
};

// ============================================
// COMPONENTS
// ============================================

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m${secs.toString().padStart(2, '0')}s`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

export function DahkaCoinClient({ userId }: { userId: string }) {
  // State
  const [price, setPrice] = useState(1);
  const [phase, setPhase] = useState<MarketPhase>('accumulation');
  const [phaseProgress, setPhaseProgress] = useState(0);
  const [phaseTimeLeft, setPhaseTimeLeft] = useState(0);
  const [momentum, setMomentum] = useState(0);
  const [volatility, setVolatility] = useState('normal');
  const [activeEvent, setActiveEvent] = useState<MarketEvent>('none');
  const [eventProgress, setEventProgress] = useState(0);
  const [eventTimeLeft, setEventTimeLeft] = useState(0);
  const [nextEventIn, setNextEventIn] = useState(0);
  const [nextPhaseProbs, setNextPhaseProbs] = useState<Record<MarketPhase, number>>({} as Record<MarketPhase, number>);
  const [eventProbs, setEventProbs] = useState({ pump: 0, crash: 0, chaos: 0 });
  const [allTimeHigh, setAllTimeHigh] = useState(1);
  const [allTimeLow, setAllTimeLow] = useState(1);
  
  const [priceHistory, setPriceHistory] = useState<{ price: number; createdAt: Date }[]>([]);
  const [realtimePrices, setRealtimePrices] = useState<{ price: number; time: number }[]>([]);
  const [userDC, setUserDC] = useState(0);
  const [userAvgPrice, setUserAvgPrice] = useState<number | null>(null);
  const [userProfit, setUserProfit] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<DCTransaction[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<"1h" | "24h" | "7d">("1h");
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");
  const [tradeAmount, setTradeAmount] = useState("");
  const [isTrading, setIsTrading] = useState(false);
  const [tradeResult, setTradeResult] = useState<{ success: boolean; message: string } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevPrice = useRef(price);

  // Load data
  const loadData = useCallback(async () => {
    const [state, txs] = await Promise.all([
      getDCState(period),
      getDCTransactions(10)
    ]);

    setPrice(state.currentPrice);
    setPhase(state.phase);
    setPhaseProgress(state.phaseProgress);
    setPhaseTimeLeft(state.phaseTimeLeft);
    setMomentum(state.momentum);
    setVolatility(state.volatility);
    setActiveEvent(state.activeEvent);
    setEventProgress(state.eventProgress);
    setEventTimeLeft(state.eventTimeLeft);
    setNextEventIn(state.nextEventIn);
    setNextPhaseProbs(state.nextPhaseProbs);
    setEventProbs(state.eventProbs);
    setAllTimeHigh(state.allTimeHigh);
    setAllTimeLow(state.allTimeLow);
    setPriceHistory(state.priceHistory);
    setUserDC(state.userDC);
    setUserAvgPrice(state.userAvgPrice);
    setUserProfit(state.userProfit);
    setTransactions(txs);
    setIsLoading(false);

    const now = Date.now();
    const recentHistory = state.priceHistory.slice(-60).map((p, i) => ({
      price: p.price,
      time: now - (60 - i) * 1000,
    }));
    if (recentHistory.length > 0) {
      setRealtimePrices(recentHistory);
    }
  }, [period]);

  useEffect(() => { loadData(); }, [loadData]);

  // Real-time updates
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const result = await tickPrice();
        
        prevPrice.current = price;
        setPrice(result.price);
        setPhase(result.phase);
        setPhaseProgress(result.phaseProgress);
        setPhaseTimeLeft(result.phaseTimeLeft);
        setMomentum(result.momentum);
        setVolatility(result.volatility);
        setActiveEvent(result.activeEvent);
        setEventProgress(result.eventProgress);
        setEventTimeLeft(result.eventTimeLeft);
        setNextEventIn(result.nextEventIn);
        setNextPhaseProbs(result.nextPhaseProbs);
        setEventProbs(result.eventProbs);
        setAllTimeHigh(result.allTimeHigh);
        setAllTimeLow(result.allTimeLow);

        setRealtimePrices(prev => {
          const newPrices = [...prev, { price: result.price, time: Date.now() }];
          return newPrices.slice(-120);
        });

        if (userAvgPrice !== null && userDC > 0) {
          setUserProfit((result.price - userAvgPrice) * userDC);
        }
      } catch {}
    }, 1000);

    return () => clearInterval(interval);
  }, [price, userAvgPrice, userDC]);

  // Reload every 30s
  useEffect(() => {
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Draw chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);

    const dataToUse = period === "1h" && realtimePrices.length > 10 
      ? realtimePrices.map(p => ({ price: p.price, createdAt: new Date(p.time) }))
      : priceHistory;

    if (dataToUse.length < 2) {
      ctx.fillStyle = "#555";
      ctx.font = "11px monospace";
      ctx.textAlign = "center";
      ctx.fillText("waiting for data...", width / 2, height / 2);
      return;
    }

    const prices = dataToUse.map(p => p.price);
    const minPrice = Math.min(...prices) * 0.98;
    const maxPrice = Math.max(...prices) * 1.02;
    const priceRange = maxPrice - minPrice || 0.01;

    // Grid
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding + (height - 2 * padding) * (i / 4);
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();

      const p = maxPrice - (priceRange * i / 4);
      ctx.fillStyle = "#444";
      ctx.font = "9px monospace";
      ctx.textAlign = "right";
      ctx.fillText(p.toFixed(4), padding - 5, y + 3);
    }

    // Line
    ctx.strokeStyle = momentum > 0.1 ? "#4ade80" : momentum < -0.1 ? "#f87171" : "#666";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    dataToUse.forEach((point, i) => {
      const x = padding + (width - 2 * padding) * (i / (dataToUse.length - 1));
      const y = padding + (height - 2 * padding) * (1 - (point.price - minPrice) / priceRange);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Current point
    const lastPoint = dataToUse[dataToUse.length - 1];
    if (lastPoint) {
      const x = width - padding;
      const y = padding + (height - 2 * padding) * (1 - (lastPoint.price - minPrice) / priceRange);
      ctx.fillStyle = momentum > 0.1 ? "#4ade80" : momentum < -0.1 ? "#f87171" : "#666";
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Avg price line
    if (userAvgPrice !== null && userAvgPrice >= minPrice && userAvgPrice <= maxPrice) {
      const y = padding + (height - 2 * padding) * (1 - (userAvgPrice - minPrice) / priceRange);
      ctx.strokeStyle = "#fbbf24";
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

  }, [priceHistory, realtimePrices, momentum, userAvgPrice, period]);

  // Trade handler
  const handleTrade = async () => {
    if (isTrading || !tradeAmount) return;
    setIsTrading(true);
    setTradeResult(null);

    const amount = parseFloat(tradeAmount);
    if (isNaN(amount) || amount <= 0) {
      setTradeResult({ success: false, message: "montant invalide" });
      setIsTrading(false);
      return;
    }

    const result = tradeMode === "buy" 
      ? await buyDahkaCoin(amount)
      : await sellDahkaCoin(amount);

    if (result.success) {
      const msg = tradeMode === "buy"
        ? `+${result.dcAmount?.toFixed(4)} dc`
        : `+${result.euroAmount?.toFixed(2)}eur`;
      setTradeResult({ success: true, message: msg });
      setTradeAmount("");
      if (result.newDCBalance !== undefined) setUserDC(result.newDCBalance);
      loadData();
    } else {
      setTradeResult({ success: false, message: result.error || "erreur" });
    }

    setIsTrading(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-[var(--text-muted)] text-sm">chargement...</p>
      </div>
    );
  }

  const priceChange = prevPrice.current !== 0 ? (price - prevPrice.current) / prevPrice.current : 0;
  const priceColor = priceChange > 0 ? "text-green-500" : priceChange < 0 ? "text-red-500" : "text-[var(--text)]";
  const phaseDisplay = PHASE_DISPLAY[phase];
  const eventDisplay = EVENT_DISPLAY[activeEvent];

  // Sort phases by probability for display
  const sortedPhases = Object.entries(nextPhaseProbs)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4);

  return (
    <div className="w-full max-w-[500px] space-y-6 animate-fade-in">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[var(--line)] pb-4">
        <Link href="/dashboard" className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-sm">
          ← retour
        </Link>
        <h1 className="text-[0.85rem] uppercase tracking-widest">dahkacoin</h1>
        <div className="w-16" />
      </header>

      {/* Event Banner */}
      {activeEvent !== 'none' && (
        <div className={`border p-3 ${
          eventDisplay.type === 'pump' ? 'border-green-500/50 bg-green-500/5' :
          eventDisplay.type === 'crash' ? 'border-red-500/50 bg-red-500/5' :
          'border-purple-500/50 bg-purple-500/5'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs uppercase tracking-widest ${
              eventDisplay.type === 'pump' ? 'text-green-500' :
              eventDisplay.type === 'crash' ? 'text-red-500' :
              'text-purple-500'
            }`}>
              {eventDisplay.label}
            </span>
            <span className="text-xs text-[var(--text-muted)] font-mono">
              {formatTime(eventTimeLeft)}
            </span>
          </div>
          <div className="h-1 bg-[rgba(255,255,255,0.1)] overflow-hidden">
            <div 
              className={`h-full transition-all duration-1000 ${
                eventDisplay.type === 'pump' ? 'bg-green-500' :
                eventDisplay.type === 'crash' ? 'bg-red-500' :
                'bg-purple-500'
              }`}
              style={{ width: `${(1 - eventProgress) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Price Display */}
      <div className="border border-[var(--line)] p-4 bg-[rgba(255,255,255,0.01)]">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)] mb-1">prix</p>
            <p className={`text-2xl font-mono ${priceColor}`}>
              {price.toFixed(4)}
              <span className="text-[var(--text-muted)] text-sm ml-1">eur</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)] mb-1">momentum</p>
            <p className={`text-lg font-mono ${momentum > 0.1 ? 'text-green-500' : momentum < -0.1 ? 'text-red-500' : 'text-[var(--text-muted)]'}`}>
              {momentum > 0 ? '+' : ''}{(momentum * 100).toFixed(0)}%
            </p>
          </div>
        </div>
        
        {/* Chart period selector */}
        <div className="flex gap-2 mb-3">
          {(["1h", "24h", "7d"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2 py-1 text-[0.65rem] uppercase tracking-widest transition-colors ${
                period === p
                  ? "bg-[var(--text)] text-[var(--bg)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <canvas ref={canvasRef} width={500} height={150} className="w-full h-[150px]" />
        
        <div className="flex justify-between text-[0.6rem] text-[var(--text-muted)] mt-2 font-mono">
          <span>atl: {allTimeLow.toFixed(4)}</span>
          <span>ath: {allTimeHigh.toFixed(4)}</span>
        </div>
      </div>

      {/* Market State */}
      <div className="grid grid-cols-2 gap-3">
        {/* Current Phase */}
        <div className="border border-[var(--line)] p-3 bg-[rgba(255,255,255,0.01)]">
          <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)] mb-2">phase</p>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm ${
              phaseDisplay.risk === 'extreme' ? 'text-red-400' :
              phaseDisplay.risk === 'high' ? 'text-orange-400' :
              phaseDisplay.risk === 'medium' ? 'text-yellow-400' :
              'text-[var(--text)]'
            }`}>
              {phaseDisplay.label}
            </span>
            <span className="text-xs text-[var(--text-muted)] font-mono">
              {formatTime(phaseTimeLeft)}
            </span>
          </div>
          <div className="h-1 bg-[rgba(255,255,255,0.1)] overflow-hidden">
            <div 
              className="h-full bg-[var(--text)] transition-all duration-1000"
              style={{ width: `${phaseProgress * 100}%` }}
            />
          </div>
        </div>

        {/* Next Event Countdown */}
        {(() => {
          // Determine dominant event type based on probabilities
          const total = eventProbs.pump + eventProbs.crash + eventProbs.chaos;
          const dominantType = total > 0 
            ? (eventProbs.pump >= eventProbs.crash && eventProbs.pump >= eventProbs.chaos ? 'pump' 
              : eventProbs.crash >= eventProbs.chaos ? 'crash' : 'chaos')
            : 'chaos';
          const barColor = dominantType === 'pump' ? 'bg-green-500' : dominantType === 'crash' ? 'bg-red-500' : 'bg-purple-500';
          
          return (
            <div className="border border-[var(--line)] p-3 bg-[rgba(255,255,255,0.01)]">
              <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)] mb-2">prochain event</p>
              <div className="flex items-center justify-between mb-2">
                <span className="text-lg font-mono text-[var(--text)]">
                  {formatTime(nextEventIn)}
                </span>
                <span className="text-[0.6rem] text-[var(--text-muted)]">
                  {volatility}
                </span>
              </div>
              <div className="h-1 bg-[rgba(255,255,255,0.1)] overflow-hidden">
                <div 
                  className={`h-full ${barColor} transition-all duration-1000`}
                  style={{ width: `${Math.max(0, (1 - nextEventIn / 90)) * 100}%` }}
                />
              </div>
            </div>
          );
        })()}
      </div>

      {/* Probabilities */}
      <div className="grid grid-cols-2 gap-3 relative">
        {/* Phase Guide - positioned to the left, spotlight effect */}
        <div className="hidden xl:block absolute right-full mr-4 top-0 w-36 text-[0.5rem] space-y-1.5 select-none">
          <p className="opacity-20 hover:opacity-100 transition-opacity duration-150"><span className="text-[var(--text)]">accumulation</span> <span className="text-[var(--text-muted)]">1-3min · calme</span></p>
          <p className="opacity-20 hover:opacity-100 transition-opacity duration-150"><span className="text-green-400">hausse</span> <span className="text-[var(--text-muted)]">45s-1.5min · monte</span></p>
          <p className="opacity-20 hover:opacity-100 transition-opacity duration-150"><span className="text-green-500">euphorie</span> <span className="text-[var(--text-muted)]">20-45s · vendre vite</span></p>
          <p className="opacity-20 hover:opacity-100 transition-opacity duration-150"><span className="text-orange-400">distribution</span> <span className="text-[var(--text-muted)]">1-2min · instable</span></p>
          <p className="opacity-20 hover:opacity-100 transition-opacity duration-150"><span className="text-red-400">baisse</span> <span className="text-[var(--text-muted)]">1.5-2.5min · descente</span></p>
          <p className="opacity-20 hover:opacity-100 transition-opacity duration-150"><span className="text-red-500">capitulation</span> <span className="text-[var(--text-muted)]">2-4min · opportunité</span></p>
          <p className="opacity-20 hover:opacity-100 transition-opacity duration-150"><span className="text-blue-400">récupération</span> <span className="text-[var(--text-muted)]">1.5-3min · repart</span></p>
        </div>
        
        {/* Next Phase Probabilities */}
        <div className="border border-[var(--line)] p-3 bg-[rgba(255,255,255,0.01)]">
          <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)] mb-3">prochaine phase</p>
          <div className="space-y-2">
            {sortedPhases.map(([p, prob]) => (
              <div key={p} className="flex items-center gap-2">
                <span className="text-[0.65rem] text-[var(--text-muted)] w-20 truncate">
                  {PHASE_DISPLAY[p as MarketPhase].label}
                </span>
                <div className="flex-1 h-1 bg-[rgba(255,255,255,0.1)] overflow-hidden">
                  <div 
                    className="h-full bg-[var(--text-muted)]"
                    style={{ width: `${prob * 100}%` }}
                  />
                </div>
                <span className="text-[0.6rem] text-[var(--text-muted)] font-mono w-8 text-right">
                  {formatPercent(prob)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Event Probabilities */}
        <div className="border border-[var(--line)] p-3 bg-[rgba(255,255,255,0.01)]">
          <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)] mb-3">type d'event</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[0.65rem] text-green-500 w-12">pump</span>
              <div className="flex-1 h-1 bg-[rgba(255,255,255,0.1)] overflow-hidden">
                <div className="h-full bg-green-500" style={{ width: `${Math.min(100, eventProbs.pump * 5000)}%` }} />
              </div>
              <span className="text-[0.6rem] text-[var(--text-muted)] font-mono w-8 text-right">
                {(eventProbs.pump * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[0.65rem] text-red-500 w-12">crash</span>
              <div className="flex-1 h-1 bg-[rgba(255,255,255,0.1)] overflow-hidden">
                <div className="h-full bg-red-500" style={{ width: `${Math.min(100, eventProbs.crash * 5000)}%` }} />
              </div>
              <span className="text-[0.6rem] text-[var(--text-muted)] font-mono w-8 text-right">
                {(eventProbs.crash * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[0.65rem] text-purple-500 w-12">chaos</span>
              <div className="flex-1 h-1 bg-[rgba(255,255,255,0.1)] overflow-hidden">
                <div className="h-full bg-purple-500" style={{ width: `${Math.min(100, eventProbs.chaos * 5000)}%` }} />
              </div>
              <span className="text-[0.6rem] text-[var(--text-muted)] font-mono w-8 text-right">
                {(eventProbs.chaos * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Portfolio */}
      <div className="border border-[var(--line)] p-4 bg-[rgba(255,255,255,0.01)]">
        <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)] mb-3">portefeuille</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[0.6rem] text-[var(--text-muted)] mb-1">solde</p>
            <p className="text-lg font-mono">{userDC.toFixed(4)} <span className="text-[var(--text-muted)] text-sm">dc</span></p>
          </div>
          <div>
            <p className="text-[0.6rem] text-[var(--text-muted)] mb-1">valeur</p>
            <p className="text-lg font-mono">{(userDC * price).toFixed(2)} <span className="text-[var(--text-muted)] text-sm">eur</span></p>
          </div>
          {userAvgPrice !== null && (
            <>
              <div>
                <p className="text-[0.6rem] text-[var(--text-muted)] mb-1">prix moyen</p>
                <p className="text-sm font-mono">{userAvgPrice.toFixed(4)}</p>
              </div>
              <div>
                <p className="text-[0.6rem] text-[var(--text-muted)] mb-1">p/l</p>
                <p className={`text-sm font-mono ${userProfit !== null && userProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {userProfit !== null ? (userProfit >= 0 ? '+' : '') + userProfit.toFixed(2) : '-'}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Trading */}
      <div className="border border-[var(--line)] p-4 bg-[rgba(255,255,255,0.01)]">
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTradeMode("buy")}
            className={`flex-1 py-2 text-[0.7rem] uppercase tracking-widest transition-colors ${
              tradeMode === "buy"
                ? "bg-green-600 text-white"
                : "border border-[var(--line)] text-[var(--text-muted)] hover:border-green-600"
            }`}
          >
            acheter
          </button>
          <button
            onClick={() => setTradeMode("sell")}
            className={`flex-1 py-2 text-[0.7rem] uppercase tracking-widest transition-colors ${
              tradeMode === "sell"
                ? "bg-red-600 text-white"
                : "border border-[var(--line)] text-[var(--text-muted)] hover:border-red-600"
            }`}
          >
            vendre
          </button>
        </div>

        <div className="flex gap-2">
          <input
            type="number"
            value={tradeAmount}
            onChange={(e) => setTradeAmount(e.target.value)}
            placeholder={tradeMode === "buy" ? "eur" : "dc"}
            step="0.01"
            min="0"
            className="flex-1 bg-transparent border border-[var(--line)] px-3 py-2 text-sm font-mono focus:border-[var(--text)] outline-none"
          />
          <button
            onClick={handleTrade}
            disabled={isTrading || !tradeAmount}
            className={`px-4 py-2 text-[0.7rem] uppercase tracking-widest transition-colors ${
              tradeMode === "buy"
                ? "bg-green-600 hover:bg-green-700 disabled:bg-green-900"
                : "bg-red-600 hover:bg-red-700 disabled:bg-red-900"
            } disabled:opacity-50`}
          >
            {isTrading ? "..." : "ok"}
          </button>
        </div>

        {tradeAmount && !isNaN(parseFloat(tradeAmount)) && (
          <p className="text-[0.65rem] text-[var(--text-muted)] mt-2 font-mono">
            {tradeMode === "buy"
              ? `≈ ${(parseFloat(tradeAmount) / price).toFixed(4)} dc`
              : `≈ ${(parseFloat(tradeAmount) * price * 0.98).toFixed(2)} eur (-2%)`}
          </p>
        )}

        {tradeResult && (
          <p className={`text-[0.65rem] mt-2 ${tradeResult.success ? "text-green-500" : "text-red-500"}`}>
            {tradeResult.message}
          </p>
        )}
      </div>

      {/* History */}
      <div className="border border-[var(--line)] p-4 bg-[rgba(255,255,255,0.01)]">
        <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)] mb-3">historique</p>
        
        {transactions.length === 0 ? (
          <p className="text-[var(--text-muted)] text-sm text-center py-4">aucune transaction</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between py-2 border-b border-[var(--line)] last:border-0">
                <div className="flex items-center gap-2">
                  <span className={`text-[0.65rem] uppercase ${tx.type === "buy" ? "text-green-500" : "text-red-500"}`}>
                    {tx.type === "buy" ? "achat" : "vente"}
                  </span>
                  <span className="text-[0.65rem] text-[var(--text-muted)] font-mono">
                    {tx.dcAmount.toFixed(4)} @ {tx.price.toFixed(4)}
                  </span>
                </div>
                <span className={`text-[0.65rem] font-mono ${tx.type === "buy" ? "text-red-500" : "text-green-500"}`}>
                  {tx.type === "buy" ? "-" : "+"}{tx.euroAmount.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
