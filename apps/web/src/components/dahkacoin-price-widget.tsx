"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface PriceData {
  price: number;
  trend: number;
}

export function DahkaCoinPriceWidget() {
  const [data, setData] = useState<PriceData | null>(null);
  const [prevPrice, setPrevPrice] = useState<number | null>(null);

  const fetchPrice = useCallback(async () => {
    try {
      const res = await fetch("/api/dahkacoin/price");
      const json = await res.json();
      if (json.price) {
        setPrevPrice(data?.price ?? null);
        setData({ price: json.price, trend: json.trend });
      }
    } catch {
      // silently fail
    }
  }, [data?.price]);

  useEffect(() => {
    fetchPrice();
    const interval = setInterval(fetchPrice, 5000);
    return () => clearInterval(interval);
  }, [fetchPrice]);

  if (!data) {
    return (
      <div className="border border-[var(--line)] bg-[rgba(255,255,255,0.01)] p-3">
        <p className="text-xs text-[var(--text-muted)]">...</p>
      </div>
    );
  }

  const priceChange = prevPrice !== null ? data.price - prevPrice : 0;
  const isUp = data.trend > 0 || priceChange > 0;
  const isDown = data.trend < 0 || priceChange < 0;

  return (
    <Link
      href="/dahkacoin"
      className="block border border-purple-500/30 bg-purple-500/5 hover:border-purple-500/50 transition-all"
    >
      <div className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">
            {isUp ? "📈" : isDown ? "📉" : "📊"}
          </span>
          <span className="text-[0.6rem] uppercase tracking-widest text-purple-400">
            dahkacoin
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`font-mono text-sm ${
              isUp
                ? "text-green-400"
                : isDown
                ? "text-red-400"
                : "text-purple-400"
            }`}
          >
            {data.price.toFixed(2)}€
          </span>
          {(isUp || isDown) && (
            <span
              className={`text-xs ${
                isUp ? "text-green-400" : "text-red-400"
              }`}
            >
              {isUp ? "▲" : "▼"}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
