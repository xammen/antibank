"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getDCState,
  buyDahkaCoin,
  sellDahkaCoin,
  getDCTransactions,
  tickPrice,
  getLiveFeed,
  getWhaleLeaderboard,
  getMarketStats,
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

interface LiveTrade {
  id: string;
  username: string;
  type: "buy" | "sell";
  dcAmount: number;
  euroAmount: number;
  price: number;
  createdAt: Date;
}

interface WhaleHolder {
  username: string;
  dcBalance: number;
  euroValue: number;
  avgPrice: number | null;
  profitLoss: number | null;
  profitPercent: number | null;
}

interface MarketStats {
  totalSupply: number;
  marketCap: number;
  holders: number;
  volume24h: number;
  buyVolume24h: number;
  sellVolume24h: number;
}

// ============================================
// CONFIG
// ============================================

const PHASE_DISPLAY: Record<MarketPhase, { label: string; color: string }> = {
  accumulation: { label: 'accumulation', color: 'text-[var(--text-muted)]' },
  markup: { label: 'hausse', color: 'text-green-400' },
  euphoria: { label: 'euphorie', color: 'text-green-500' },
  distribution: { label: 'distribution', color: 'text-orange-400' },
  decline: { label: 'baisse', color: 'text-red-400' },
  capitulation: { label: 'capitulation', color: 'text-red-500' },
  recovery: { label: 'recuperation', color: 'text-blue-400' },
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
// HELPERS
// ============================================

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m${secs.toString().padStart(2, '0')}s`;
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function formatNumber(n: number, decimals: number = 2): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(decimals);
}

// ============================================
// SLIDER COMPONENT
// ============================================

function Slider({
  value,
  onChange,
  min,
  max,
  step,
  formatValue,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  formatValue: (v: number) => string;
}) {
  const percentage = ((value - min) / (max - min)) * 100;
  
  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-8 flex items-center">
        <div className="absolute inset-x-0 h-1.5 bg-[var(--line)] rounded-full">
          <div 
            className="h-full bg-[var(--text)] rounded-full transition-all duration-100"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-x-0 w-full h-8 opacity-0 cursor-pointer"
        />
        <div 
          className="absolute w-4 h-4 bg-[var(--text)] rounded-full shadow-[0_0_10px_rgba(255,255,255,0.3)] pointer-events-none transition-all duration-100"
          style={{ left: `calc(${percentage}% - 8px)` }}
        />
      </div>
      <div className="flex justify-between text-[0.6rem] text-[var(--text-muted)] font-mono">
        <span>{formatValue(min)}</span>
        <span className="text-[var(--text)]">{formatValue(value)}</span>
        <span>{formatValue(max)}</span>
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

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
  
  // Live feed & whales
  const [liveFeed, setLiveFeed] = useState<LiveTrade[]>([]);
  const [whales, setWhales] = useState<WhaleHolder[]>([]);
  const [marketStats, setMarketStats] = useState<MarketStats | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<"1h" | "24h" | "7d">("1h");
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");
  const [tradeAmount, setTradeAmount] = useState(10);
  const [isTrading, setIsTrading] = useState(false);
  const [tradeResult, setTradeResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showProbabilities, setShowProbabilities] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevPrice = useRef(price);
  const priceDirection = useRef<'up' | 'down' | 'stable'>('stable');

  // Calculate price changes for display
  const [change1h, setChange1h] = useState(0);
  const [change24h, setChange24h] = useState(0);

  // Load data
  const loadData = useCallback(async () => {
    const [state, txs, feed, whl, stats] = await Promise.all([
      getDCState(period),
      getDCTransactions(10),
      getLiveFeed(15),
      getWhaleLeaderboard(5),
      getMarketStats(),
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
    setLiveFeed(feed);
    setWhales(whl);
    setMarketStats(stats);
    setIsLoading(false);

    // Calculate historical changes
    if (state.priceHistory.length > 0) {
      const now = Date.now();
      const h1Ago = state.priceHistory.find(p => now - new Date(p.createdAt).getTime() < 3600000);
      const h24Ago = state.priceHistory.find(p => now - new Date(p.createdAt).getTime() < 86400000);
      if (h1Ago) setChange1h(((state.currentPrice - h1Ago.price) / h1Ago.price) * 100);
      if (h24Ago) setChange24h(((state.currentPrice - h24Ago.price) / h24Ago.price) * 100);
    }

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
        
        // Track direction
        if (result.price > prevPrice.current) {
          priceDirection.current = 'up';
        } else if (result.price < prevPrice.current) {
          priceDirection.current = 'down';
        } else {
          priceDirection.current = 'stable';
        }
        
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

  // Reload feed and whales every 10s
  useEffect(() => {
    const interval = setInterval(async () => {
      const [feed, whl, stats] = await Promise.all([
        getLiveFeed(15),
        getWhaleLeaderboard(5),
        getMarketStats(),
      ]);
      setLiveFeed(feed);
      setWhales(whl);
      setMarketStats(stats);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Draw chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = { top: 20, right: 50, bottom: 20, left: 10 };

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

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Grid lines
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + chartHeight * (i / 4);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      const p = maxPrice - (priceRange * i / 4);
      ctx.fillStyle = "#444";
      ctx.font = "9px monospace";
      ctx.textAlign = "left";
      ctx.fillText(p.toFixed(2), width - padding.right + 5, y + 3);
    }

    // Price line with gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    if (momentum > 0.1) {
      gradient.addColorStop(0, "rgba(74, 222, 128, 0.8)");
      gradient.addColorStop(1, "rgba(74, 222, 128, 0.1)");
    } else if (momentum < -0.1) {
      gradient.addColorStop(0, "rgba(248, 113, 113, 0.8)");
      gradient.addColorStop(1, "rgba(248, 113, 113, 0.1)");
    } else {
      gradient.addColorStop(0, "rgba(136, 136, 136, 0.8)");
      gradient.addColorStop(1, "rgba(136, 136, 136, 0.1)");
    }

    // Fill area under curve
    ctx.fillStyle = gradient;
    ctx.beginPath();
    dataToUse.forEach((point, i) => {
      const x = padding.left + chartWidth * (i / (dataToUse.length - 1));
      const y = padding.top + chartHeight * (1 - (point.price - minPrice) / priceRange);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(padding.left + chartWidth, height - padding.bottom);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.closePath();
    ctx.fill();

    // Price line
    ctx.strokeStyle = momentum > 0.1 ? "#4ade80" : momentum < -0.1 ? "#f87171" : "#888";
    ctx.lineWidth = 2;
    ctx.beginPath();
    dataToUse.forEach((point, i) => {
      const x = padding.left + chartWidth * (i / (dataToUse.length - 1));
      const y = padding.top + chartHeight * (1 - (point.price - minPrice) / priceRange);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Current price dot
    const lastPoint = dataToUse[dataToUse.length - 1];
    if (lastPoint) {
      const x = padding.left + chartWidth;
      const y = padding.top + chartHeight * (1 - (lastPoint.price - minPrice) / priceRange);
      
      // Glow effect
      ctx.shadowColor = momentum > 0.1 ? "#4ade80" : momentum < -0.1 ? "#f87171" : "#888";
      ctx.shadowBlur = 10;
      ctx.fillStyle = momentum > 0.1 ? "#4ade80" : momentum < -0.1 ? "#f87171" : "#888";
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Avg price line
    if (userAvgPrice !== null && userAvgPrice >= minPrice && userAvgPrice <= maxPrice) {
      const y = padding.top + chartHeight * (1 - (userAvgPrice - minPrice) / priceRange);
      ctx.strokeStyle = "#fbbf24";
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Label
      ctx.fillStyle = "#fbbf24";
      ctx.font = "8px monospace";
      ctx.textAlign = "left";
      ctx.fillText("avg", width - padding.right + 5, y - 5);
    }

  }, [priceHistory, realtimePrices, momentum, userAvgPrice, period]);

  // Trade handler
  const handleTrade = async () => {
    if (isTrading || tradeAmount <= 0) return;
    setIsTrading(true);
    setTradeResult(null);

    const result = tradeMode === "buy" 
      ? await buyDahkaCoin(tradeAmount)
      : await sellDahkaCoin(tradeAmount);

    if (result.success) {
      const msg = tradeMode === "buy"
        ? `+${result.dcAmount?.toFixed(4)} dc`
        : `+${result.euroAmount?.toFixed(2)}€`;
      setTradeResult({ success: true, message: msg });
      if (result.newDCBalance !== undefined) setUserDC(result.newDCBalance);
      // Refresh feed
      const feed = await getLiveFeed(15);
      setLiveFeed(feed);
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

  const priceColor = priceDirection.current === 'up' ? "text-green-500" : priceDirection.current === 'down' ? "text-red-500" : "text-[var(--text)]";
  const phaseDisplay = PHASE_DISPLAY[phase];
  const eventDisplay = EVENT_DISPLAY[activeEvent];

  // Sort phases by probability
  const sortedPhases = Object.entries(nextPhaseProbs)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  return (
    <div className="w-full max-w-[800px] space-y-4 animate-fade-in">
      
      {/* Event Banner */}
      {activeEvent !== 'none' && (
        <div className={`border p-3 ${
          eventDisplay.type === 'pump' ? 'border-green-500/50 bg-green-500/10' :
          eventDisplay.type === 'crash' ? 'border-red-500/50 bg-red-500/10' :
          'border-purple-500/50 bg-purple-500/10'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm uppercase tracking-widest font-bold ${
              eventDisplay.type === 'pump' ? 'text-green-500' :
              eventDisplay.type === 'crash' ? 'text-red-500' :
              'text-purple-500'
            }`}>
              {eventDisplay.label}
            </span>
            <span className="text-sm text-[var(--text-muted)] font-mono">
              {formatTime(eventTimeLeft)}
            </span>
          </div>
          <div className="h-1 bg-[rgba(255,255,255,0.1)] overflow-hidden rounded-full">
            <div 
              className={`h-full transition-all duration-1000 rounded-full ${
                eventDisplay.type === 'pump' ? 'bg-green-500' :
                eventDisplay.type === 'crash' ? 'bg-red-500' :
                'bg-purple-500'
              }`}
              style={{ width: `${(1 - eventProgress) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Price Header */}
      <div className="border border-[var(--line)] p-4 bg-[rgba(255,255,255,0.01)]">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)] mb-1">dahkacoin</p>
            <p className={`text-4xl font-mono font-light ${priceColor} transition-colors`}>
              {price.toFixed(4)}
              <span className="text-[var(--text-muted)] text-lg ml-2">eur</span>
            </p>
          </div>
          <div className="text-right space-y-1">
            <div className="flex gap-3 justify-end">
              <div>
                <p className="text-[0.5rem] uppercase text-[var(--text-muted)]">1h</p>
                <p className={`text-sm font-mono ${change1h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {change1h >= 0 ? '+' : ''}{change1h.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-[0.5rem] uppercase text-[var(--text-muted)]">24h</p>
                <p className={`text-sm font-mono ${change24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {change24h >= 0 ? '+' : ''}{change24h.toFixed(1)}%
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <span className={`text-xs ${phaseDisplay.color}`}>{phaseDisplay.label}</span>
              <span className="text-xs text-[var(--text-muted)] font-mono">{formatTime(phaseTimeLeft)}</span>
            </div>
          </div>
        </div>
        
        {/* Period selector */}
        <div className="flex gap-2 mb-3">
          {(["1h", "24h", "7d"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-[0.65rem] uppercase tracking-widest transition-colors ${
                period === p
                  ? "bg-[var(--text)] text-[var(--bg)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--line)]"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Chart - full width */}
        <canvas ref={canvasRef} width={800} height={200} className="w-full h-[200px]" />
        
        <div className="flex justify-between text-[0.6rem] text-[var(--text-muted)] mt-2 font-mono">
          <span>atl: {allTimeLow.toFixed(4)}€</span>
          <span className={momentum > 0.1 ? 'text-green-500' : momentum < -0.1 ? 'text-red-500' : ''}>
            momentum: {momentum > 0 ? '+' : ''}{(momentum * 100).toFixed(0)}%
          </span>
          <span>ath: {allTimeHigh.toFixed(4)}€</span>
        </div>
      </div>

      {/* Market Stats */}
      {marketStats && (
        <div className="grid grid-cols-4 gap-2">
          <div className="border border-[var(--line)] p-3 bg-[rgba(255,255,255,0.01)]">
            <p className="text-[0.5rem] uppercase tracking-widest text-[var(--text-muted)]">market cap</p>
            <p className="text-sm font-mono">{formatNumber(marketStats.marketCap)}€</p>
          </div>
          <div className="border border-[var(--line)] p-3 bg-[rgba(255,255,255,0.01)]">
            <p className="text-[0.5rem] uppercase tracking-widest text-[var(--text-muted)]">volume 24h</p>
            <p className="text-sm font-mono">{formatNumber(marketStats.volume24h)}€</p>
          </div>
          <div className="border border-[var(--line)] p-3 bg-[rgba(255,255,255,0.01)]">
            <p className="text-[0.5rem] uppercase tracking-widest text-[var(--text-muted)]">supply</p>
            <p className="text-sm font-mono">{formatNumber(marketStats.totalSupply)} dc</p>
          </div>
          <div className="border border-[var(--line)] p-3 bg-[rgba(255,255,255,0.01)]">
            <p className="text-[0.5rem] uppercase tracking-widest text-[var(--text-muted)]">holders</p>
            <p className="text-sm font-mono">{marketStats.holders}</p>
          </div>
        </div>
      )}

      {/* Portfolio + Trading */}
      <div className="grid grid-cols-2 gap-4">
        {/* Portfolio */}
        <div className="border border-[var(--line)] p-4 bg-[rgba(255,255,255,0.01)]">
          <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)] mb-3">portefeuille</p>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)] text-sm">solde</span>
              <span className="font-mono">{userDC.toFixed(4)} dc</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)] text-sm">valeur</span>
              <span className="font-mono">{(userDC * price).toFixed(2)}€</span>
            </div>
            {userAvgPrice !== null && userDC > 0 && (
              <>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)] text-sm">prix moyen</span>
                  <span className="font-mono">{userAvgPrice.toFixed(4)}€</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)] text-sm">p/l</span>
                  <span className={`font-mono ${userProfit !== null && userProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {userProfit !== null ? (userProfit >= 0 ? '+' : '') + userProfit.toFixed(2) + '€' : '-'}
                  </span>
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

          <Slider
            value={tradeAmount}
            onChange={setTradeAmount}
            min={tradeMode === "buy" ? 1 : 0.1}
            max={tradeMode === "buy" ? 1000 : Math.max(userDC, 0.1)}
            step={tradeMode === "buy" ? 1 : 0.1}
            formatValue={(v) => tradeMode === "buy" ? `${v}€` : `${v.toFixed(2)} dc`}
          />

          <div className="flex gap-2 mt-3">
            {(tradeMode === "buy" ? [10, 50, 100, 500] : [userDC * 0.25, userDC * 0.5, userDC * 0.75, userDC]).map((amt, i) => (
              <button
                key={i}
                onClick={() => setTradeAmount(Math.max(tradeMode === "buy" ? 1 : 0.1, amt))}
                className="flex-1 py-1 text-[0.6rem] border border-[var(--line)] text-[var(--text-muted)] hover:border-[var(--text-muted)]"
              >
                {tradeMode === "buy" ? `${amt}€` : `${(amt / userDC * 100).toFixed(0)}%`}
              </button>
            ))}
          </div>

          <button
            onClick={handleTrade}
            disabled={isTrading || tradeAmount <= 0}
            className={`w-full mt-4 py-3 text-[0.7rem] uppercase tracking-widest transition-colors ${
              tradeMode === "buy"
                ? "bg-green-600 hover:bg-green-700 disabled:bg-green-900"
                : "bg-red-600 hover:bg-red-700 disabled:bg-red-900"
            } disabled:opacity-50`}
          >
            {isTrading ? "..." : tradeMode === "buy" 
              ? `acheter ≈${(tradeAmount / price).toFixed(4)} dc`
              : `vendre ≈${(tradeAmount * price * 0.98).toFixed(2)}€`}
          </button>

          {tradeResult && (
            <p className={`text-[0.65rem] mt-2 text-center ${tradeResult.success ? "text-green-500" : "text-red-500"}`}>
              {tradeResult.message}
            </p>
          )}
        </div>
      </div>

      {/* Live Feed & Whales */}
      <div className="grid grid-cols-2 gap-4">
        {/* Live Feed */}
        <div className="border border-[var(--line)] p-4 bg-[rgba(255,255,255,0.01)]">
          <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)] mb-3">live feed</p>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {liveFeed.length === 0 ? (
              <p className="text-[var(--text-muted)] text-xs text-center py-4">aucune transaction</p>
            ) : (
              liveFeed.map((trade) => (
                <div key={trade.id} className="flex items-center justify-between text-xs py-1 border-b border-[var(--line)]/30 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={`uppercase font-bold ${trade.type === "buy" ? "text-green-500" : "text-red-500"}`}>
                      {trade.type === "buy" ? "+" : "-"}
                    </span>
                    <span className="text-[var(--text-muted)] truncate max-w-[60px]">{trade.username}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-[var(--text-muted)]">{trade.dcAmount.toFixed(2)} dc</span>
                    <span className={trade.type === "buy" ? "text-green-500" : "text-red-500"}>
                      {trade.euroAmount.toFixed(0)}€
                    </span>
                    <span className="text-[var(--text-muted)] text-[0.6rem]">{formatTimeAgo(trade.createdAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Whales */}
        <div className="border border-[var(--line)] p-4 bg-[rgba(255,255,255,0.01)]">
          <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)] mb-3">top holders</p>
          <div className="space-y-2">
            {whales.length === 0 ? (
              <p className="text-[var(--text-muted)] text-xs text-center py-4">aucun holder</p>
            ) : (
              whales.map((whale, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-[var(--line)]/30 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-muted)] w-4">{i + 1}.</span>
                    <span className="truncate max-w-[80px]">{whale.username}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-[var(--text-muted)]">{formatNumber(whale.dcBalance, 1)} dc</span>
                    {whale.profitPercent !== null && (
                      <span className={whale.profitPercent >= 0 ? "text-green-500" : "text-red-500"}>
                        {whale.profitPercent >= 0 ? "+" : ""}{whale.profitPercent.toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Probabilities (collapsible) */}
      <div className="border border-[var(--line)] bg-[rgba(255,255,255,0.01)]">
        <button
          onClick={() => setShowProbabilities(!showProbabilities)}
          className="w-full p-3 flex items-center justify-between text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <span>probabilites & analyse</span>
          <span>{showProbabilities ? '−' : '+'}</span>
        </button>
        
        {showProbabilities && (
          <div className="p-4 pt-0 grid grid-cols-2 gap-4">
            {/* Next Phase */}
            <div>
              <p className="text-[0.5rem] uppercase tracking-widest text-[var(--text-muted)] mb-2">prochaine phase</p>
              <div className="space-y-1">
                {sortedPhases.map(([p, prob]) => (
                  <div key={p} className="flex items-center gap-2">
                    <span className={`text-[0.6rem] w-20 ${PHASE_DISPLAY[p as MarketPhase].color}`}>
                      {PHASE_DISPLAY[p as MarketPhase].label}
                    </span>
                    <div className="flex-1 h-1 bg-[rgba(255,255,255,0.1)] overflow-hidden rounded-full">
                      <div className="h-full bg-[var(--text-muted)]" style={{ width: `${prob * 100}%` }} />
                    </div>
                    <span className="text-[0.5rem] text-[var(--text-muted)] font-mono w-8 text-right">
                      {(prob * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Event Probabilities */}
            <div>
              <p className="text-[0.5rem] uppercase tracking-widest text-[var(--text-muted)] mb-2">
                prochain event ({formatTime(nextEventIn)})
              </p>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[0.6rem] text-green-500 w-12">pump</span>
                  <div className="flex-1 h-1 bg-[rgba(255,255,255,0.1)] overflow-hidden rounded-full">
                    <div className="h-full bg-green-500" style={{ width: `${Math.min(100, eventProbs.pump * 5000)}%` }} />
                  </div>
                  <span className="text-[0.5rem] text-[var(--text-muted)] font-mono w-10 text-right">
                    {(eventProbs.pump * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[0.6rem] text-red-500 w-12">crash</span>
                  <div className="flex-1 h-1 bg-[rgba(255,255,255,0.1)] overflow-hidden rounded-full">
                    <div className="h-full bg-red-500" style={{ width: `${Math.min(100, eventProbs.crash * 5000)}%` }} />
                  </div>
                  <span className="text-[0.5rem] text-[var(--text-muted)] font-mono w-10 text-right">
                    {(eventProbs.crash * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[0.6rem] text-purple-500 w-12">chaos</span>
                  <div className="flex-1 h-1 bg-[rgba(255,255,255,0.1)] overflow-hidden rounded-full">
                    <div className="h-full bg-purple-500" style={{ width: `${Math.min(100, eventProbs.chaos * 5000)}%` }} />
                  </div>
                  <span className="text-[0.5rem] text-[var(--text-muted)] font-mono w-10 text-right">
                    {(eventProbs.chaos * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Personal History */}
      <div className="border border-[var(--line)] p-4 bg-[rgba(255,255,255,0.01)]">
        <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)] mb-3">mes transactions</p>
        
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
                  {tx.type === "buy" ? "-" : "+"}{tx.euroAmount.toFixed(2)}€
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
