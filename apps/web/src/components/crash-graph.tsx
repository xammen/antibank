"use client";

import { useRef, useEffect, useCallback } from "react";
import { calculateMultiplier } from "@/lib/crash";

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
  const animationRef = useRef<number | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    // Set canvas size
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.scale(dpr, dpr);
    }

    const width = rect.width;
    const height = rect.height;
    const padding = { top: 40, right: 40, bottom: 40, left: 50 };
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;

    // Colors
    const isRed = state === "crashed";
    const lineColor = isRed ? "#ef4444" : "#e0e0e0";
    const glowColor = isRed ? "rgba(239, 68, 68, 0.4)" : "rgba(224, 224, 224, 0.3)";

    // Clear
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);

    // Calculate current multiplier for running state
    let currentMult = multiplier;
    let elapsedMs = 0;
    
    if (state === "running" && startTime) {
      elapsedMs = Date.now() - startTime;
      currentMult = calculateMultiplier(elapsedMs);
    }

    // Grid
    ctx.strokeStyle = "rgba(85, 85, 85, 0.3)";
    ctx.lineWidth = 1;
    const maxY = Math.max(currentMult * 1.2, 2);
    
    const gridSteps = maxY > 10 ? 5 : maxY > 5 ? 2 : 1;
    for (let y = 1; y <= maxY; y += gridSteps) {
      const yPos = padding.top + graphHeight - ((y - 1) / (maxY - 1)) * graphHeight;
      ctx.beginPath();
      ctx.moveTo(padding.left, yPos);
      ctx.lineTo(width - padding.right, yPos);
      ctx.stroke();
      
      ctx.fillStyle = "#555";
      ctx.font = "10px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${y.toFixed(1)}x`, padding.left - 8, yPos + 3);
    }

    // Draw curve if running or crashed
    if ((state === "running" || state === "crashed") && elapsedMs > 0) {
      const points: { x: number; y: number }[] = [];
      const totalTime = state === "crashed" ? elapsedMs : elapsedMs;
      const numPoints = Math.min(100, Math.max(20, Math.floor(totalTime / 50)));
      
      for (let i = 0; i <= numPoints; i++) {
        const t = (i / numPoints) * totalTime;
        const m = calculateMultiplier(t);
        const x = padding.left + (i / numPoints) * graphWidth * 0.9; // Use 90% of width
        const y = padding.top + graphHeight - ((m - 1) / (maxY - 1)) * graphHeight;
        points.push({ x, y: Math.max(padding.top, y) });
      }

      if (points.length > 1) {
        // Glow
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 12;
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();

        // Fill under curve
        ctx.shadowBlur = 0;
        const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
        gradient.addColorStop(0, isRed ? "rgba(239, 68, 68, 0.15)" : "rgba(224, 224, 224, 0.1)");
        gradient.addColorStop(1, "transparent");
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.lineTo(points[points.length - 1].x, height - padding.bottom);
        ctx.lineTo(points[0].x, height - padding.bottom);
        ctx.closePath();
        ctx.fill();

        // End point
        if (state === "running") {
          const last = points[points.length - 1];
          ctx.beginPath();
          ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = lineColor;
          ctx.shadowColor = glowColor;
          ctx.shadowBlur = 8;
          ctx.fill();
        }
      }
    }

    // Continue animation if running
    if (state === "running") {
      animationRef.current = requestAnimationFrame(draw);
    }
  }, [state, multiplier, startTime]);

  // Start/stop animation based on state
  useEffect(() => {
    if (state === "running") {
      animationRef.current = requestAnimationFrame(draw);
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      // Draw once for non-running states
      draw();
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [state, draw]);

  // Redraw on multiplier change for non-running states
  useEffect(() => {
    if (state !== "running") {
      draw();
    }
  }, [multiplier, state, draw]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [draw]);

  return (
    <div className="relative w-full h-full min-h-[300px]" ref={containerRef}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      
      {/* Overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {state === "waiting" && countdown !== undefined && (
          <div className="flex flex-col items-center gap-1">
            <span className="text-[4rem] font-light tabular-nums text-[var(--text)]">
              {countdown}
            </span>
            <span className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
              secondes
            </span>
          </div>
        )}
        
        {state === "running" && (
          <span className="text-[5rem] font-light tabular-nums text-[var(--text)]">
            {multiplier.toFixed(2)}x
          </span>
        )}
        
        {state === "crashed" && (
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs uppercase tracking-widest text-red-400">crash</span>
            <span className="text-[5rem] font-light tabular-nums text-red-400">
              {(crashPoint || multiplier).toFixed(2)}x
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
