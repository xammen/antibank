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

interface PricePoint {
  price: number;
  createdAt: Date;
}

interface DCTransaction {
  id: string;
  type: string;
  dcAmount: number;
  euroAmount: number;
  price: number;
  createdAt: Date;
}

interface DahkaCoinClientProps {
  userId: string;
}

// Phase cycle order (for timeline)
const PHASE_CYCLE = [
  'accumulation',
  'markup', 
  'euphoria',
  'distribution',
  'decline',
  'capitulation',
  'recovery',
] as const;

type MarketPhase = typeof PHASE_CYCLE[number];

// Phase config
const PHASE_CONFIG: Record<MarketPhase, { 
  emoji: string; 
  name: string; 
  color: string;
  bgColor: string;
  description: string;
  risk: 'low' | 'medium' | 'high' | 'extreme';
}> = {
  accumulation: { 
    emoji: '📦', 
    name: 'accumulation', 
    color: 'text-gray-400',
    bgColor: 'bg-gray-500',
    description: 'marche calme, bon moment pour acheter',
    risk: 'low',
  },
  markup: { 
    emoji: '📈', 
    name: 'hausse', 
    color: 'text-green-400',
    bgColor: 'bg-green-500',
    description: 'tendance haussiere, momentum positif',
    risk: 'medium',
  },
  euphoria: { 
    emoji: '🚀', 
    name: 'EUPHORIE', 
    color: 'text-green-300',
    bgColor: 'bg-green-400',
    description: 'MOON! gains extremes possibles',
    risk: 'extreme',
  },
  distribution: { 
    emoji: '🎭', 
    name: 'distribution', 
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500',
    description: 'top en formation, attention!',
    risk: 'high',
  },
  decline: { 
    emoji: '📉', 
    name: 'baisse', 
    color: 'text-red-400',
    bgColor: 'bg-red-500',
    description: 'tendance baissiere, prudence',
    risk: 'medium',
  },
  capitulation: { 
    emoji: '💀', 
    name: 'CAPITULATION', 
    color: 'text-red-300',
    bgColor: 'bg-red-400',
    description: 'CRASH! pertes extremes possibles',
    risk: 'extreme',
  },
  recovery: { 
    emoji: '🌱', 
    name: 'recuperation', 
    color: 'text-blue-400',
    bgColor: 'bg-blue-500',
    description: 'rebond en cours, opportunite?',
    risk: 'low',
  },
};

// Phase transitions probabilities
const PHASE_TRANSITIONS: Record<MarketPhase, Partial<Record<MarketPhase, number>>> = {
  accumulation: { markup: 0.60, decline: 0.25, accumulation: 0.15 },
  markup: { euphoria: 0.50, distribution: 0.30, markup: 0.20 },
  euphoria: { distribution: 0.70, capitulation: 0.20, euphoria: 0.10 },
  distribution: { decline: 0.50, capitulation: 0.30, markup: 0.15, distribution: 0.05 },
  decline: { capitulation: 0.40, recovery: 0.35, decline: 0.25 },
  capitulation: { recovery: 0.80, capitulation: 0.15, accumulation: 0.05 },
  recovery: { accumulation: 0.60, markup: 0.30, decline: 0.10 },
};

// Event probabilities per phase (base probabilities * multipliers)
const EVENT_BASE_PROBS = {
  pump: 0.003,  // whale_pump + mega_pump + fomo combined per second
  crash: 0.002, // whale_dump + flash_crash + panic combined per second
};

const PHASE_EVENT_MULTIPLIERS: Record<MarketPhase, { pump: number; crash: number }> = {
  accumulation: { pump: 1.5, crash: 0.3 },
  markup: { pump: 2.0, crash: 0.5 },
  euphoria: { pump: 0.5, crash: 2.5 },  // More likely to crash from euphoria
  distribution: { pump: 0.5, crash: 2.0 },
  decline: { pump: 0.5, crash: 1.5 },
  capitulation: { pump: 1.5, crash: 0.3 },  // More likely to pump from bottom
  recovery: { pump: 1.5, crash: 0.5 },
};

// Animated price display
function AnimatedPrice({ value, momentum }: { value: number; momentum: number }) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isIncreasing, setIsIncreasing] = useState(false);
  const [isDecreasing, setIsDecreasing] = useState(false);
  const prevValue = useRef(value);

  useEffect(() => {
    if (value !== prevValue.current) {
      setIsIncreasing(value > prevValue.current);
      setIsDecreasing(value < prevValue.current);
      
      const diff = value - prevValue.current;
      const steps = 10;
      const stepValue = diff / steps;
      let current = prevValue.current;
      let step = 0;

      const animate = () => {
        step++;
        current += stepValue;
        if (step >= steps) {
          setDisplayValue(value);
          prevValue.current = value;
          setTimeout(() => {
            setIsIncreasing(false);
            setIsDecreasing(false);
          }, 200);
        } else {
          setDisplayValue(current);
          requestAnimationFrame(animate);
        }
      };
      requestAnimationFrame(animate);
    }
  }, [value]);

  const getTrendColor = () => {
    if (isIncreasing) return "text-green-400";
    if (isDecreasing) return "text-red-400";
    if (momentum > 0.3) return "text-green-400";
    if (momentum < -0.3) return "text-red-400";
    return "text-gray-400";
  };

  const getTrendIcon = () => {
    if (momentum > 0.5) return "↑↑";
    if (momentum > 0.2) return "↑";
    if (momentum < -0.5) return "↓↓";
    if (momentum < -0.2) return "↓";
    return "→";
  };

  return (
    <span className={`text-3xl font-light transition-colors duration-200 ${getTrendColor()}`}>
      {displayValue.toFixed(4)}€ {getTrendIcon()}
    </span>
  );
}

// Phase Timeline Component
function PhaseTimeline({ 
  currentPhase, 
  phaseProgress,
  momentum,
}: { 
  currentPhase: MarketPhase; 
  phaseProgress: number;
  momentum: number;
}) {
  const currentIndex = PHASE_CYCLE.indexOf(currentPhase);
  const config = PHASE_CONFIG[currentPhase];
  const transitions = PHASE_TRANSITIONS[currentPhase];
  const eventMultipliers = PHASE_EVENT_MULTIPLIERS[currentPhase];
  
  // Calculate event probabilities for next 60 seconds
  const pumpChance = Math.min(99, Math.round(EVENT_BASE_PROBS.pump * eventMultipliers.pump * 60 * 100));
  const crashChance = Math.min(99, Math.round(EVENT_BASE_PROBS.crash * eventMultipliers.crash * 60 * 100));
  
  // Get most likely next phases
  const sortedTransitions = Object.entries(transitions)
    .sort(([, a], [, b]) => (b || 0) - (a || 0))
    .slice(0, 3);

  // Safe progress value
  const safeProgress = isNaN(phaseProgress) ? 0 : Math.max(0, Math.min(1, phaseProgress));

  return (
    <div className="border border-[var(--line)] p-4 space-y-4">
      {/* Current phase header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{config.emoji}</span>
          <div>
            <p className={`font-medium ${config.color}`}>{config.name}</p>
            <p className="text-xs text-[var(--text-muted)]">{config.description}</p>
          </div>
        </div>
        <div className={`px-2 py-1 text-xs rounded ${
          config.risk === 'low' ? 'bg-green-500/20 text-green-400' :
          config.risk === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
          config.risk === 'high' ? 'bg-orange-500/20 text-orange-400' :
          'bg-red-500/20 text-red-400 animate-pulse'
        }`}>
          risque {config.risk === 'extreme' ? 'EXTREME' : config.risk}
        </div>
      </div>

      {/* Phase cycle timeline */}
      <div className="relative">
        <div className="flex gap-1">
          {PHASE_CYCLE.map((phase, idx) => {
            const phaseConfig = PHASE_CONFIG[phase];
            const isCurrentPhase = idx === currentIndex;
            const isPast = idx < currentIndex;
            
            return (
              <div 
                key={phase}
                className="flex-1 relative group"
              >
                {/* Phase bar */}
                <div className={`h-8 rounded-sm relative overflow-hidden transition-all ${
                  isCurrentPhase 
                    ? `${phaseConfig.bgColor} ring-2 ring-white/50` 
                    : isPast 
                      ? 'bg-gray-700' 
                      : 'bg-gray-800'
                }`}>
                  {/* Progress fill for current phase */}
                  {isCurrentPhase && (
                    <div 
                      className="absolute inset-y-0 left-0 bg-white/30 transition-all duration-1000"
                      style={{ width: `${safeProgress * 100}%` }}
                    />
                  )}
                  {/* Phase emoji centered */}
                  <div className="absolute inset-0 flex items-center justify-center text-sm">
                    {phaseConfig.emoji}
                  </div>
                </div>
                
                {/* Tooltip on hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black border border-[var(--line)] text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  {phaseConfig.name}
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Progress percentage under current phase */}
        <div className="flex gap-1 mt-1">
          {PHASE_CYCLE.map((phase, idx) => (
            <div key={phase} className="flex-1 text-center">
              {idx === currentIndex && (
                <span className="text-xs text-[var(--text-muted)]">
                  {Math.round(safeProgress * 100)}%
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Next phase probabilities */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-[var(--text-muted)] mb-2">prochaine phase probable</p>
          <div className="space-y-1">
            {sortedTransitions.map(([nextPhase, probability]) => {
              const nextConfig = PHASE_CONFIG[nextPhase as MarketPhase];
              return (
                <div key={nextPhase} className="flex items-center gap-2">
                  <span>{nextConfig.emoji}</span>
                  <div className="flex-1 h-2 bg-gray-800 rounded overflow-hidden">
                    <div 
                      className={`h-full ${nextConfig.bgColor} opacity-70`}
                      style={{ width: `${(probability || 0) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-[var(--text-muted)] w-8">
                    {Math.round((probability || 0) * 100)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Event chances */}
        <div>
          <p className="text-xs text-[var(--text-muted)] mb-2">chance d'event (60s)</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-green-400">🚀</span>
              <div className="flex-1 h-2 bg-gray-800 rounded overflow-hidden">
                <div 
                  className="h-full bg-green-500"
                  style={{ width: `${pumpChance}%` }}
                />
              </div>
              <span className="text-xs text-green-400 w-8">{pumpChance}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-red-400">💥</span>
              <div className="flex-1 h-2 bg-gray-800 rounded overflow-hidden">
                <div 
                  className="h-full bg-red-500"
                  style={{ width: `${crashChance}%` }}
                />
              </div>
              <span className="text-xs text-red-400 w-8">{crashChance}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Momentum indicator */}
      <div>
        <p className="text-xs text-[var(--text-muted)] mb-1">momentum</p>
        <div className="h-3 bg-gray-800 rounded overflow-hidden relative">
          {/* Center marker */}
          <div className="absolute inset-y-0 left-1/2 w-px bg-gray-600" />
          {/* Momentum bar */}
          <div 
            className={`absolute inset-y-0 transition-all duration-300 ${
              momentum >= 0 ? 'bg-green-500 left-1/2' : 'bg-red-500 right-1/2'
            }`}
            style={{ 
              width: `${Math.abs(momentum) * 50}%`,
              [momentum >= 0 ? 'left' : 'right']: '50%'
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-[var(--text-muted)] mt-1">
          <span>bearish</span>
          <span className={momentum > 0.3 ? 'text-green-400' : momentum < -0.3 ? 'text-red-400' : ''}>
            {momentum > 0 ? '+' : ''}{(momentum * 100).toFixed(0)}%
          </span>
          <span>bullish</span>
        </div>
      </div>
    </div>
  );
}

export function DahkaCoinClient({ userId }: DahkaCoinClientProps) {
  const [currentPrice, setCurrentPrice] = useState<number>(1);
  const [phase, setPhase] = useState<MarketPhase>("accumulation");
  const [phaseProgress, setPhaseProgress] = useState<number>(0);
  const [volatility, setVolatility] = useState<string>("normal");
  const [momentum, setMomentum] = useState<number>(0);
  const [activeEvent, setActiveEvent] = useState<string>("none");
  const [eventIntensity, setEventIntensity] = useState<number>(0);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [realtimePrices, setRealtimePrices] = useState<{ price: number; time: number }[]>([]);
  const [userDC, setUserDC] = useState<number>(0);
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

  // Initial data load
  const loadData = useCallback(async () => {
    const [state, txs] = await Promise.all([
      getDCState(period),
      getDCTransactions(10)
    ]);

    setCurrentPrice(state.currentPrice);
    setPhase(state.phase as MarketPhase);
    setPhaseProgress(state.phaseProgress || 0);
    setVolatility(state.volatility);
    setMomentum(state.momentum);
    setActiveEvent(state.activeEvent);
    setEventIntensity(state.eventIntensity);
    setPriceHistory(state.priceHistory);
    setUserDC(state.userDC);
    setUserAvgPrice(state.userAvgPrice);
    setUserProfit(state.userProfit);
    setTransactions(txs);
    setIsLoading(false);

    // Initialize realtime prices with last 60 points from history
    const now = Date.now();
    const recentHistory = state.priceHistory.slice(-60).map((p, i) => ({
      price: p.price,
      time: now - (60 - i) * 1000,
    }));
    if (recentHistory.length > 0) {
      setRealtimePrices(recentHistory);
    }
  }, [period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time price updates every second
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const result = await tickPrice();
        
        setCurrentPrice(result.price);
        setPhase(result.phase as MarketPhase);
        setPhaseProgress(result.phaseProgress || 0);
        setVolatility(result.volatility);
        setMomentum(result.momentum);
        setActiveEvent(result.activeEvent);
        setEventIntensity(result.eventIntensity);

        // Add to realtime prices (keep last 120 points = 2 minutes)
        setRealtimePrices(prev => {
          const newPrices = [...prev, { price: result.price, time: Date.now() }];
          return newPrices.slice(-120);
        });

        // Update profit
        if (userAvgPrice !== null && userDC > 0) {
          setUserProfit((result.price - userAvgPrice) * userDC);
        }
      } catch {
        // Silently fail
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [userAvgPrice, userDC]);

  // Reload full data every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadData();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Draw chart with smooth animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;

    // Clear
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);

    // Use realtime prices for 1h view, historical for others
    const dataToUse = period === "1h" && realtimePrices.length > 10 
      ? realtimePrices.map(p => ({ price: p.price, createdAt: new Date(p.time) }))
      : priceHistory;

    if (dataToUse.length < 2) {
      ctx.fillStyle = "#666";
      ctx.font = "12px JetBrains Mono";
      ctx.textAlign = "center";
      ctx.fillText("en attente de donnees...", width / 2, height / 2);
      return;
    }

    const prices = dataToUse.map(p => p.price);
    const minPrice = Math.min(...prices) * 0.98;
    const maxPrice = Math.max(...prices) * 1.02;
    const priceRange = maxPrice - minPrice || 0.01;

    // Draw grid
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding + (height - 2 * padding) * (i / 4);
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();

      const price = maxPrice - (priceRange * i / 4);
      ctx.fillStyle = "#666";
      ctx.font = "10px JetBrains Mono";
      ctx.textAlign = "right";
      ctx.fillText(price.toFixed(4) + "€", padding - 5, y + 3);
    }

    // Draw gradient fill based on momentum
    const gradient = ctx.createLinearGradient(0, padding, 0, height - padding);
    if (momentum > 0.2) {
      gradient.addColorStop(0, "rgba(74, 222, 128, 0.3)");
      gradient.addColorStop(1, "rgba(74, 222, 128, 0)");
    } else if (momentum < -0.2) {
      gradient.addColorStop(0, "rgba(248, 113, 113, 0.3)");
      gradient.addColorStop(1, "rgba(248, 113, 113, 0)");
    } else {
      gradient.addColorStop(0, "rgba(136, 136, 136, 0.2)");
      gradient.addColorStop(1, "rgba(136, 136, 136, 0)");
    }

    // Draw filled area
    ctx.beginPath();
    dataToUse.forEach((point, i) => {
      const x = padding + (width - 2 * padding) * (i / (dataToUse.length - 1));
      const y = padding + (height - 2 * padding) * (1 - (point.price - minPrice) / priceRange);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.lineTo(width - padding, height - padding);
    ctx.lineTo(padding, height - padding);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw price line
    ctx.strokeStyle = momentum > 0.2 ? "#4ade80" : momentum < -0.2 ? "#f87171" : "#888";
    ctx.lineWidth = 2;
    ctx.beginPath();
    dataToUse.forEach((point, i) => {
      const x = padding + (width - 2 * padding) * (i / (dataToUse.length - 1));
      const y = padding + (height - 2 * padding) * (1 - (point.price - minPrice) / priceRange);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw current price marker with glow
    const lastPoint = dataToUse[dataToUse.length - 1];
    if (lastPoint) {
      const x = width - padding;
      const y = padding + (height - 2 * padding) * (1 - (lastPoint.price - minPrice) / priceRange);
      
      ctx.shadowColor = momentum > 0.2 ? "#4ade80" : momentum < -0.2 ? "#f87171" : "#888";
      ctx.shadowBlur = 10;
      
      ctx.fillStyle = momentum > 0.2 ? "#4ade80" : momentum < -0.2 ? "#f87171" : "#888";
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.shadowBlur = 0;
    }

    // Draw avg buy price line
    if (userAvgPrice !== null && userAvgPrice >= minPrice && userAvgPrice <= maxPrice) {
      const y = padding + (height - 2 * padding) * (1 - (userAvgPrice - minPrice) / priceRange);
      ctx.strokeStyle = "#fbbf24";
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.fillStyle = "#fbbf24";
      ctx.font = "10px JetBrains Mono";
      ctx.textAlign = "left";
      ctx.fillText("achat: " + userAvgPrice.toFixed(4) + "€", padding + 5, y - 5);
    }

  }, [priceHistory, realtimePrices, momentum, userAvgPrice, period]);

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

    let result;
    if (tradeMode === "buy") {
      result = await buyDahkaCoin(amount);
    } else {
      result = await sellDahkaCoin(amount);
    }

    if (result.success) {
      const msg = tradeMode === "buy"
        ? `achat de ${result.dcAmount?.toFixed(4)} DC pour ${result.euroAmount?.toFixed(2)}€`
        : `vente de ${result.dcAmount?.toFixed(4)} DC pour ${result.euroAmount?.toFixed(2)}€`;
      setTradeResult({ success: true, message: msg });
      setTradeAmount("");
      
      if (result.newDCBalance !== undefined) {
        setUserDC(result.newDCBalance);
      }
      
      loadData();
    } else {
      setTradeResult({ success: false, message: result.error || "erreur" });
    }

    setIsTrading(false);
  };

  const getEventBanner = () => {
    if (activeEvent === "none") return null;
    
    const events: Record<string, { text: string; color: string }> = {
      whale_pump: { text: "🐋 WHALE PUMP!", color: "border-green-500 bg-green-500/10 text-green-400" },
      whale_dump: { text: "🐋 WHALE DUMP!", color: "border-red-500 bg-red-500/10 text-red-400" },
      flash_crash: { text: "⚡ FLASH CRASH!", color: "border-red-600 bg-red-600/10 text-red-300" },
      mega_pump: { text: "🚀 MEGA PUMP!", color: "border-green-400 bg-green-400/10 text-green-300" },
      liquidity_crisis: { text: "💀 LIQUIDITE CRISIS!", color: "border-yellow-500 bg-yellow-500/10 text-yellow-400" },
      fomo_wave: { text: "📈 FOMO WAVE!", color: "border-green-500 bg-green-500/10 text-green-400" },
      panic_wave: { text: "📉 PANIC!", color: "border-red-500 bg-red-500/10 text-red-400" },
    };
    
    const event = events[activeEvent];
    if (!event) return null;
    
    return (
      <div className={`p-4 border text-center animate-pulse ${event.color}`}>
        {event.text} (intensite: {(eventIntensity * 100).toFixed(0)}%)
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="text-center">
        <p className="text-[var(--text-muted)]">chargement...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
          ← retour
        </Link>
        <h1 className="text-xl font-light">dahkacoin</h1>
        <div className="w-16" />
      </div>

      {/* Event banner */}
      {getEventBanner()}

      {/* Phase Timeline */}
      <PhaseTimeline 
        currentPhase={phase} 
        phaseProgress={phaseProgress}
        momentum={momentum}
      />

      {/* Price card */}
      <div className="border border-[var(--line)] p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[var(--text-muted)] text-sm">prix actuel</p>
            <AnimatedPrice value={currentPrice} momentum={momentum} />
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--text-muted)]">volatilite</p>
            <p className={`text-sm ${
              volatility === 'calme' ? 'text-gray-400' :
              volatility === 'normal' ? 'text-gray-300' :
              volatility === 'volatile' ? 'text-yellow-400' :
              volatility === 'extreme' ? 'text-orange-400' :
              'text-red-400 animate-pulse'
            }`}>{volatility}</p>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex gap-2 mb-4">
          {(["1h", "24h", "7d"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-sm transition-colors ${
                period === p
                  ? "bg-[var(--text)] text-[var(--bg)]"
                  : "border border-[var(--line)] hover:border-[var(--text)]"
              }`}
            >
              {p}
            </button>
          ))}
          <span className="ml-auto text-xs text-[var(--text-muted)] self-center">
            {period === "1h" ? "temps reel" : "historique"}
          </span>
        </div>

        {/* Chart */}
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full h-[200px]"
        />
      </div>

      {/* Portfolio */}
      <div className="border border-[var(--line)] p-6">
        <h2 className="text-lg font-light mb-4">ton portefeuille</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[var(--text-muted)] text-sm">dahkacoins</p>
            <p className="text-2xl font-light">{userDC.toFixed(4)} DC</p>
          </div>
          <div>
            <p className="text-[var(--text-muted)] text-sm">valeur actuelle</p>
            <p className="text-2xl font-light">{(userDC * currentPrice).toFixed(2)}€</p>
          </div>
          {userAvgPrice !== null && (
            <>
              <div>
                <p className="text-[var(--text-muted)] text-sm">prix moyen d'achat</p>
                <p className="text-lg font-light">{userAvgPrice.toFixed(4)}€</p>
              </div>
              <div>
                <p className="text-[var(--text-muted)] text-sm">profit/perte</p>
                <p className={`text-lg font-light ${
                  userProfit !== null && userProfit >= 0 ? "text-green-400" : "text-red-400"
                }`}>
                  {userProfit !== null ? (userProfit >= 0 ? "+" : "") + userProfit.toFixed(2) + "€" : "-"}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Trading */}
      <div className="border border-[var(--line)] p-6">
        <h2 className="text-lg font-light mb-4">trader</h2>
        
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTradeMode("buy")}
            className={`flex-1 py-2 transition-colors ${
              tradeMode === "buy"
                ? "bg-green-600 text-white"
                : "border border-[var(--line)] hover:border-green-600"
            }`}
          >
            acheter
          </button>
          <button
            onClick={() => setTradeMode("sell")}
            className={`flex-1 py-2 transition-colors ${
              tradeMode === "sell"
                ? "bg-red-600 text-white"
                : "border border-[var(--line)] hover:border-red-600"
            }`}
          >
            vendre
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[var(--text-muted)] text-sm block mb-1">
              {tradeMode === "buy" ? "montant en euros" : "quantite de DC"}
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={tradeAmount}
                onChange={(e) => setTradeAmount(e.target.value)}
                placeholder={tradeMode === "buy" ? "ex: 10" : "ex: 5.5"}
                step="0.01"
                min="0"
                className="flex-1 bg-transparent border border-[var(--line)] px-3 py-2 focus:border-[var(--text)] outline-none transition-colors"
              />
              <button
                onClick={handleTrade}
                disabled={isTrading || !tradeAmount}
                className={`px-6 py-2 transition-colors ${
                  tradeMode === "buy"
                    ? "bg-green-600 hover:bg-green-700 disabled:bg-green-900"
                    : "bg-red-600 hover:bg-red-700 disabled:bg-red-900"
                } disabled:opacity-50`}
              >
                {isTrading ? "..." : tradeMode === "buy" ? "acheter" : "vendre"}
              </button>
            </div>
          </div>

          {tradeAmount && !isNaN(parseFloat(tradeAmount)) && (
            <p className="text-[var(--text-muted)] text-sm">
              {tradeMode === "buy"
                ? `≈ ${(parseFloat(tradeAmount) / currentPrice).toFixed(4)} DC`
                : `≈ ${(parseFloat(tradeAmount) * currentPrice * 0.98).toFixed(2)}€ (apres 2% frais)`}
            </p>
          )}

          {tradeResult && (
            <p className={tradeResult.success ? "text-green-400" : "text-red-400"}>
              {tradeResult.message}
            </p>
          )}
        </div>
      </div>

      {/* Transaction history */}
      <div className="border border-[var(--line)] p-6">
        <h2 className="text-lg font-light mb-4">historique</h2>
        
        {transactions.length === 0 ? (
          <p className="text-[var(--text-muted)] text-center">aucune transaction</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between py-2 border-b border-[var(--line)] last:border-0"
              >
                <div>
                  <span className={tx.type === "buy" ? "text-green-400" : "text-red-400"}>
                    {tx.type === "buy" ? "achat" : "vente"}
                  </span>
                  <span className="text-[var(--text-muted)] ml-2">
                    {tx.dcAmount.toFixed(4)} DC @ {tx.price.toFixed(4)}€
                  </span>
                </div>
                <div className="text-right">
                  <span className={tx.type === "buy" ? "text-red-400" : "text-green-400"}>
                    {tx.type === "buy" ? "-" : "+"}{tx.euroAmount.toFixed(2)}€
                  </span>
                  <span className="text-[var(--text-muted)] text-sm block">
                    {new Date(tx.createdAt).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
