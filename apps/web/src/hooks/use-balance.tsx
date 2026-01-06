"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from "react";

interface BalanceContextType {
  balance: string;
  displayBalance: number;
  intensity: number;
  setBalance: (balance: string) => void;
  addToBalance: (amount: number) => void;
  refreshBalance: () => Promise<void>;
}

const BalanceContext = createContext<BalanceContextType | null>(null);

export function BalanceProvider({
  children,
  initialBalance,
}: {
  children: ReactNode;
  initialBalance: string;
}) {
  const [balance, setBalanceState] = useState(initialBalance);
  const [displayBalance, setDisplayBalance] = useState(parseFloat(initialBalance));
  const [intensity, setIntensity] = useState(0);
  const clickTimes = useRef<number[]>([]);
  const animationRef = useRef<number | null>(null);
  const currentDisplayRef = useRef<number>(parseFloat(initialBalance));

  const animateBalance = useCallback((from: number, to: number) => {
    // Skip si la différence est négligeable
    if (Math.abs(from - to) < 0.001) {
      return;
    }
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    
    const duration = 150;
    const startTime = performance.now();
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * eased;
      
      setDisplayBalance(current);
      currentDisplayRef.current = current;
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);
  }, []);

  const setBalance = useCallback((newBalance: string) => {
    const newValue = parseFloat(newBalance);
    // Utilise la ref pour avoir la vraie valeur actuelle
    animateBalance(currentDisplayRef.current, newValue);
    setBalanceState(newBalance);
  }, [animateBalance]);

  const addToBalance = useCallback((amount: number) => {
    // Track click times for intensity
    const now = Date.now();
    clickTimes.current.push(now);
    clickTimes.current = clickTimes.current.filter(t => now - t < 1000); // 1 sec window
    
    // Calculate intensity based on clicks in last second
    const clicksPerSecond = clickTimes.current.length;
    const newIntensity = Math.min(clicksPerSecond / 12, 1); // 0 to 1, max at 12 clicks/sec
    setIntensity(newIntensity);

    setBalanceState((prev) => {
      const newValue = parseFloat(prev) + amount;
      // Utilise la ref pour avoir la vraie valeur actuelle
      animateBalance(currentDisplayRef.current, newValue);
      return newValue.toFixed(2);
    });
  }, [animateBalance]);

  // Smooth decay of intensity
  useEffect(() => {
    const decayInterval = setInterval(() => {
      setIntensity(prev => {
        if (prev <= 0.01) return 0;
        return prev * 0.85; // Exponential decay - loses 15% every 50ms
      });
    }, 50);

    return () => clearInterval(decayInterval);
  }, []);

  const refreshBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/balance");
      const data = await res.json();
      const newValue = parseFloat(data.balance);
      // Utilise la ref pour avoir la vraie valeur actuelle
      animateBalance(currentDisplayRef.current, newValue);
      setBalanceState(data.balance);
    } catch {
      // Ignore errors
    }
  }, [animateBalance]);

  return (
    <BalanceContext.Provider value={{ 
      balance, 
      displayBalance,
      intensity,
      setBalance, 
      addToBalance, 
      refreshBalance 
    }}>
      {children}
    </BalanceContext.Provider>
  );
}

export function useBalance(fallback: string) {
  const context = useContext(BalanceContext);

  // Si pas de contexte, utiliser un état local (fallback)
  const [localBalance, setLocalBalance] = useState(fallback);
  const [localDisplayBalance, setLocalDisplayBalance] = useState(parseFloat(fallback));
  
  const addToLocalBalance = useCallback((amount: number) => {
    setLocalBalance((prev) => {
      const newVal = parseFloat(prev) + amount;
      setLocalDisplayBalance(newVal);
      return newVal.toFixed(2);
    });
  }, []);

  const refreshLocalBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/balance");
      const data = await res.json();
      setLocalBalance(data.balance);
      setLocalDisplayBalance(parseFloat(data.balance));
    } catch {}
  }, []);

  if (!context) {
    return {
      balance: localBalance,
      displayBalance: localDisplayBalance,
      intensity: 0,
      setBalance: setLocalBalance,
      addToBalance: addToLocalBalance,
      refreshBalance: refreshLocalBalance,
    };
  }

  return context;
}
