"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  getDCState,
  buyDahkaCoin,
  sellDahkaCoin,
  getDCTransactions,
  updatePrice,
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

export function DahkaCoinClient({ userId }: DahkaCoinClientProps) {
  const [currentPrice, setCurrentPrice] = useState<number>(1);
  const [trend, setTrend] = useState<number>(0);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [userDC, setUserDC] = useState<number>(0);
  const [userAvgPrice, setUserAvgPrice] = useState<number | null>(null);
  const [userProfit, setUserProfit] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<DCTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<"1h" | "24h" | "7d">("1h");
  
  // Trading form
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");
  const [tradeAmount, setTradeAmount] = useState("");
  const [isTrading, setIsTrading] = useState(false);
  const [tradeResult, setTradeResult] = useState<{ success: boolean; message: string } | null>(null);
  
  // Price update timer
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [secondsUntilUpdate, setSecondsUntilUpdate] = useState(30);
  const [event, setEvent] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const loadData = useCallback(async () => {
    const [state, txs] = await Promise.all([
      getDCState(period),
      getDCTransactions(10)
    ]);

    setCurrentPrice(state.currentPrice);
    setTrend(state.trend);
    setPriceHistory(state.priceHistory);
    setUserDC(state.userDC);
    setUserAvgPrice(state.userAvgPrice);
    setUserProfit(state.userProfit);
    setLastUpdate(state.lastUpdate);
    setTransactions(txs);
    setIsLoading(false);
  }, [period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh price every 30 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      const result = await updatePrice();
      setCurrentPrice(result.price);
      setTrend(result.trend);
      if (result.event) {
        setEvent(result.event);
        setTimeout(() => setEvent(null), 5000);
      }
      setSecondsUntilUpdate(30);
      loadData();
    }, 30000);

    const countdown = setInterval(() => {
      setSecondsUntilUpdate(s => Math.max(0, s - 1));
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(countdown);
    };
  }, [loadData]);

  // Draw chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || priceHistory.length < 2) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;

    // Clear
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);

    // Find min/max
    const prices = priceHistory.map(p => p.price);
    const minPrice = Math.min(...prices) * 0.95;
    const maxPrice = Math.max(...prices) * 1.05;
    const priceRange = maxPrice - minPrice || 1;

    // Draw grid lines
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding + (height - 2 * padding) * (i / 4);
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();

      // Price labels
      const price = maxPrice - (priceRange * i / 4);
      ctx.fillStyle = "#666";
      ctx.font = "10px JetBrains Mono";
      ctx.textAlign = "right";
      ctx.fillText(price.toFixed(2) + "€", padding - 5, y + 3);
    }

    // Draw price line
    ctx.strokeStyle = trend > 0 ? "#4ade80" : trend < 0 ? "#f87171" : "#888";
    ctx.lineWidth = 2;
    ctx.beginPath();

    priceHistory.forEach((point, i) => {
      const x = padding + (width - 2 * padding) * (i / (priceHistory.length - 1));
      const y = padding + (height - 2 * padding) * (1 - (point.price - minPrice) / priceRange);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw current price marker
    const lastPoint = priceHistory[priceHistory.length - 1];
    if (lastPoint) {
      const x = width - padding;
      const y = padding + (height - 2 * padding) * (1 - (lastPoint.price - minPrice) / priceRange);
      
      ctx.fillStyle = trend > 0 ? "#4ade80" : trend < 0 ? "#f87171" : "#888";
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw avg buy price line if user has DC
    if (userAvgPrice !== null && userAvgPrice >= minPrice && userAvgPrice <= maxPrice) {
      const y = padding + (height - 2 * padding) * (1 - (userAvgPrice - minPrice) / priceRange);
      ctx.strokeStyle = "#fbbf24";
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.fillStyle = "#fbbf24";
      ctx.font = "10px JetBrains Mono";
      ctx.textAlign = "left";
      ctx.fillText("prix moyen: " + userAvgPrice.toFixed(4) + "€", padding + 5, y - 5);
    }

  }, [priceHistory, trend, userAvgPrice]);

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
      loadData();
    } else {
      setTradeResult({ success: false, message: result.error || "erreur" });
    }

    setIsTrading(false);
  };

  const getTrendIcon = () => {
    if (trend > 0) return "↑";
    if (trend < 0) return "↓";
    return "→";
  };

  const getTrendColor = () => {
    if (trend > 0) return "text-green-400";
    if (trend < 0) return "text-red-400";
    return "text-gray-400";
  };

  if (isLoading) {
    return (
      <div className="text-center">
        <p className="text-[var(--text-muted)]">chargement...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
          ← retour
        </Link>
        <h1 className="text-xl font-light">dahkacoin</h1>
        <div className="w-16" />
      </div>

      {/* Event banner */}
      {event && (
        <div className={`p-4 rounded border text-center animate-pulse ${
          event === "pump" 
            ? "border-green-500 bg-green-500/10 text-green-400" 
            : "border-red-500 bg-red-500/10 text-red-400"
        }`}>
          {event === "pump" ? "🚀 PUMP! +30% à +80%" : "📉 KRACH! -30% à -60%"}
        </div>
      )}

      {/* Price card */}
      <div className="border border-[var(--line)] p-6 rounded">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[var(--text-muted)] text-sm">prix actuel</p>
            <p className={`text-3xl font-light ${getTrendColor()}`}>
              {currentPrice.toFixed(4)}€ {getTrendIcon()}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[var(--text-muted)] text-sm">mise à jour dans</p>
            <p className="text-xl font-light">{secondsUntilUpdate}s</p>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex gap-2 mb-4">
          {(["1h", "24h", "7d"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                period === p
                  ? "bg-[var(--text)] text-[var(--bg)]"
                  : "border border-[var(--line)] hover:border-[var(--text)]"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Chart */}
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full h-[200px] rounded"
        />
      </div>

      {/* Portfolio */}
      <div className="border border-[var(--line)] p-6 rounded">
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
      <div className="border border-[var(--line)] p-6 rounded">
        <h2 className="text-lg font-light mb-4">trader</h2>
        
        {/* Mode selector */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTradeMode("buy")}
            className={`flex-1 py-2 rounded transition-colors ${
              tradeMode === "buy"
                ? "bg-green-600 text-white"
                : "border border-[var(--line)] hover:border-green-600"
            }`}
          >
            acheter
          </button>
          <button
            onClick={() => setTradeMode("sell")}
            className={`flex-1 py-2 rounded transition-colors ${
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
              {tradeMode === "buy" ? "montant en euros" : "quantité de DC"}
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={tradeAmount}
                onChange={(e) => setTradeAmount(e.target.value)}
                placeholder={tradeMode === "buy" ? "ex: 10" : "ex: 5.5"}
                step="0.01"
                min="0"
                className="flex-1 bg-transparent border border-[var(--line)] rounded px-3 py-2 focus:border-[var(--text)] outline-none transition-colors"
              />
              <button
                onClick={handleTrade}
                disabled={isTrading || !tradeAmount}
                className={`px-6 py-2 rounded transition-colors ${
                  tradeMode === "buy"
                    ? "bg-green-600 hover:bg-green-700 disabled:bg-green-900"
                    : "bg-red-600 hover:bg-red-700 disabled:bg-red-900"
                } disabled:opacity-50`}
              >
                {isTrading ? "..." : tradeMode === "buy" ? "acheter" : "vendre"}
              </button>
            </div>
          </div>

          {/* Preview */}
          {tradeAmount && !isNaN(parseFloat(tradeAmount)) && (
            <p className="text-[var(--text-muted)] text-sm">
              {tradeMode === "buy"
                ? `≈ ${(parseFloat(tradeAmount) / currentPrice).toFixed(4)} DC`
                : `≈ ${(parseFloat(tradeAmount) * currentPrice * 0.98).toFixed(2)}€ (après 2% frais)`}
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
      <div className="border border-[var(--line)] p-6 rounded">
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

      {/* Info */}
      <div className="text-[var(--text-muted)] text-sm space-y-1">
        <p>• le prix change toutes les 30 secondes</p>
        <p>• variation normale: -5% à +5% + tendance</p>
        <p>• 5% de chance de pump (+30% à +80%) ou krach (-30% à -60%)</p>
        <p>• frais de vente: 2%</p>
        <p>• prix minimum: 0.10€ / maximum: 50€</p>
      </div>
    </div>
  );
}
