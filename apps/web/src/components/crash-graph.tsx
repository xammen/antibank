"use client";

import { useRef, useEffect, useMemo } from "react";

interface CrashGraphProps {
  state: "waiting" | "starting" | "running" | "crashed";
  multiplier: number;
  crashPoint?: number;
  countdown?: number;
  startTime?: number | null;
}

export function CrashGraph({ state, multiplier, crashPoint, countdown, startTime }: CrashGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pointsRef = useRef<{ x: number; y: number }[]>([]);
  const lastMultRef = useRef<number>(1);

  // Couleurs
  const colors = useMemo(() => ({
    background: "#0a0a0a",
    grid: "rgba(85, 85, 85, 0.3)",
    line: state === "crashed" ? "#ef4444" : "#22c55e",
    lineGlow: state === "crashed" ? "rgba(239, 68, 68, 0.5)" : "rgba(34, 197, 94, 0.6)",
  }), [state]);

  // Reset points quand nouvelle partie
  useEffect(() => {
    if (state === "waiting") {
      pointsRef.current = [];
      lastMultRef.current = 1;
    }
  }, [state]);

  // Ajouter point quand multiplier change
  useEffect(() => {
    if (state === "running" && multiplier > lastMultRef.current) {
      const elapsed = startTime ? Date.now() - startTime : 0;
      const x = Math.min(elapsed / 300, 100); // 30 sec = 100%
      pointsRef.current.push({ x, y: multiplier });
      lastMultRef.current = multiplier;
      
      // Limiter les points
      if (pointsRef.current.length > 300) {
        pointsRef.current = pointsRef.current.slice(-300);
      }
    }
  }, [multiplier, state, startTime]);

  // Dessiner le canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = { top: 40, right: 40, bottom: 40, left: 60 };
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;

    // Clear
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    const maxY = Math.max(multiplier * 1.3, 2);
    
    for (let y = 1; y <= maxY; y += maxY > 10 ? 5 : maxY > 5 ? 2 : 1) {
      const yPos = padding.top + graphHeight - (y / maxY) * graphHeight;
      ctx.beginPath();
      ctx.moveTo(padding.left, yPos);
      ctx.lineTo(width - padding.right, yPos);
      ctx.stroke();
      
      ctx.fillStyle = "#888";
      ctx.font = "11px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${y.toFixed(1)}x`, padding.left - 10, yPos + 4);
    }

    // Points
    const points = pointsRef.current;
    if (points.length > 1) {
      // Glow
      ctx.shadowColor = colors.lineGlow;
      ctx.shadowBlur = 15;
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      points.forEach((point, i) => {
        const x = padding.left + (point.x / 100) * graphWidth;
        const y = padding.top + graphHeight - (point.y / maxY) * graphHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Fill gradient
      const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
      gradient.addColorStop(0, state === "crashed" ? "rgba(239, 68, 68, 0.2)" : "rgba(34, 197, 94, 0.2)");
      gradient.addColorStop(1, "transparent");

      ctx.shadowBlur = 0;
      ctx.fillStyle = gradient;
      ctx.beginPath();
      points.forEach((point, i) => {
        const x = padding.left + (point.x / 100) * graphWidth;
        const y = padding.top + graphHeight - (point.y / maxY) * graphHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      const lastX = padding.left + (points[points.length - 1].x / 100) * graphWidth;
      ctx.lineTo(lastX, height - padding.bottom);
      ctx.lineTo(padding.left, height - padding.bottom);
      ctx.closePath();
      ctx.fill();

      // Point final
      if (state === "running") {
        const last = points[points.length - 1];
        const x = padding.left + (last.x / 100) * graphWidth;
        const y = padding.top + graphHeight - (last.y / maxY) * graphHeight;
        
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = colors.line;
        ctx.shadowColor = colors.lineGlow;
        ctx.shadowBlur = 10;
        ctx.fill();
      }
    }
  }, [multiplier, state, colors]);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      // Force redraw on resize
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="relative w-full h-full min-h-[300px]" ref={containerRef}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      
      {/* Overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {state === "waiting" && countdown !== undefined && (
          <div className="flex flex-col items-center gap-2">
            <span className="text-[4rem] font-light tabular-nums text-[var(--text)] animate-pulse">
              {countdown}s
            </span>
            <span className="text-sm uppercase tracking-widest text-[var(--text-muted)]">
              prochaine partie
            </span>
          </div>
        )}
        
        {state === "running" && (
          <span 
            className="text-[5rem] font-light tabular-nums"
            style={{
              color: multiplier >= 2 ? "#22c55e" : "#e0e0e0",
              textShadow: multiplier >= 2 ? "0 0 30px rgba(34, 197, 94, 0.5)" : "none",
            }}
          >
            {multiplier.toFixed(2)}x
          </span>
        )}
        
        {state === "crashed" && (
          <div className="flex flex-col items-center gap-2">
            <span className="text-sm uppercase tracking-widest text-red-400">crashed</span>
            <span 
              className="text-[5rem] font-light tabular-nums text-red-500"
              style={{ textShadow: "0 0 30px rgba(239, 68, 68, 0.5)" }}
            >
              {(crashPoint || multiplier).toFixed(2)}x
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
