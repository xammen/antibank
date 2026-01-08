"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

interface PriceData {
  price: number;
  trend: number;
}

export function DahkaCoinPriceWidget() {
  const [data, setData] = useState<PriceData | null>(null);
  const [prevPrice, setPrevPrice] = useState<number | null>(null);
  const [flashClass, setFlashClass] = useState<string>("");
  const lastPriceRef = useRef<number | null>(null);

  const fetchPrice = useCallback(async () => {
    try {
      const res = await fetch("/api/dahkacoin/price");
      const json = await res.json();
      if (json.price) {
        const oldPrice = lastPriceRef.current;
        lastPriceRef.current = json.price;
        
        if (oldPrice !== null && oldPrice !== json.price) {
          setPrevPrice(oldPrice);
          // Flash animation on price change
          if (json.price > oldPrice) {
            setFlashClass("animate-flash-green");
          } else if (json.price < oldPrice) {
            setFlashClass("animate-flash-red");
          }
          setTimeout(() => setFlashClass(""), 500);
        }
        
        setData({ price: json.price, trend: json.trend });
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchPrice();
    const interval = setInterval(fetchPrice, 2000); // 2s polling like dahkacoin page
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
  const changePercent = prevPrice ? ((data.price - prevPrice) / prevPrice * 100) : 0;

  return (
    <Link
      href="/dahkacoin"
      className={`block border border-purple-500/30 bg-purple-500/5 hover:border-purple-500/50 transition-all ${flashClass}`}
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
        <div className="flex items-center gap-3">
          <span
            className={`font-mono text-base transition-colors ${
              isUp
                ? "text-green-400"
                : isDown
                ? "text-red-400"
                : "text-purple-400"
            }`}
          >
            {data.price.toFixed(4)}€
          </span>
          {priceChange !== 0 && (
            <span
              className={`text-xs font-mono ${
                priceChange > 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {priceChange > 0 ? "+" : ""}{changePercent.toFixed(2)}%
            </span>
          )}
          {(isUp || isDown) && (
            <span
              className={`text-sm ${
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
