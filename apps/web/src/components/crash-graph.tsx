"use client";

import { useRef, useEffect, useCallback } from "react";
import { calculateMultiplier, timeToMultiplier } from "@/lib/crash";

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
    const padding = { top: 30, right: 30, bottom: 50, left: 60 };
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;

    // Clear with dark background
    ctx.fillStyle = "#080808";
    ctx.fillRect(0, 0, width, height);

    // Calculate current multiplier and elapsed time
    let currentMult = multiplier;
    let elapsedMs = 0;
    
    if (state === "running") {
      if (startTime) {
        elapsedMs = Math.max(0, Date.now() - startTime);
        currentMult = calculateMultiplier(elapsedMs);
      } else {
        elapsedMs = 100;
        currentMult = multiplier > 1 ? multiplier : 1.01;
      }
    } else if (state === "crashed") {
      if (crashPoint) {
        // Calculate how long the game ran before crashing
        elapsedMs = timeToMultiplier(crashPoint);
        currentMult = crashPoint;
      }
    }

    // Dynamic Y-axis scaling
    const maxY = Math.max(currentMult * 1.3, 2);
    const minY = 1;

    // Colors based on state
    const isRed = state === "crashed";
    const primaryColor = isRed ? "#ef4444" : "#22c55e"; // green when running
    const secondaryColor = isRed ? "rgba(239, 68, 68, 0.2)" : "rgba(34, 197, 94, 0.15)";

    // Draw subtle grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;

    // Horizontal grid lines (multiplier levels)
    const ySteps = maxY > 10 ? [2, 5, 10, 20, 50] : maxY > 5 ? [2, 3, 5, 7] : [1.5, 2, 2.5, 3];
    const relevantSteps = ySteps.filter(s => s <= maxY && s >= minY);
    
    for (const y of relevantSteps) {
      const yPos = padding.top + graphHeight - ((y - minY) / (maxY - minY)) * graphHeight;
      if (yPos > padding.top && yPos < height - padding.bottom) {
        ctx.beginPath();
        ctx.moveTo(padding.left, yPos);
        ctx.lineTo(width - padding.right, yPos);
        ctx.stroke();
        
        // Y-axis labels
        ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        ctx.font = "11px JetBrains Mono, monospace";
        ctx.textAlign = "right";
        ctx.fillText(`${y.toFixed(1)}x`, padding.left - 10, yPos + 4);
      }
    }

    // Base line at 1.00x
    const baseY = padding.top + graphHeight;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.beginPath();
    ctx.moveTo(padding.left, baseY);
    ctx.lineTo(width - padding.right, baseY);
    ctx.stroke();
    
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.fillText("1.00x", padding.left - 10, baseY + 4);

    // Draw the curve
    if (state === "running" || state === "crashed") {
      const points: { x: number; y: number }[] = [];
      
      // Calculate total time for the curve
      const totalTime = elapsedMs;
      const numPoints = Math.min(200, Math.max(50, Math.floor(totalTime / 30)));
      
      // Time-based X-axis (proportional to elapsed time)
      for (let i = 0; i <= numPoints; i++) {
        const t = (i / numPoints) * totalTime;
        const m = calculateMultiplier(t);
        
        // X position based on time proportion
        const x = padding.left + (i / numPoints) * graphWidth;
        // Y position based on multiplier (logarithmic feel via exponential curve)
        const normalizedY = (m - minY) / (maxY - minY);
        const y = padding.top + graphHeight - normalizedY * graphHeight;
        
        points.push({ x, y: Math.max(padding.top, Math.min(height - padding.bottom, y)) });
      }

      if (points.length > 1) {
        // Gradient fill under curve
        const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
        gradient.addColorStop(0, secondaryColor);
        gradient.addColorStop(0.7, "rgba(0, 0, 0, 0)");
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(points[0].x, baseY);
        for (const point of points) {
          ctx.lineTo(point.x, point.y);
        }
        ctx.lineTo(points[points.length - 1].x, baseY);
        ctx.closePath();
        ctx.fill();

        // Main curve line with glow
        ctx.shadowColor = primaryColor;
        ctx.shadowBlur = 15;
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        
        // Smooth curve using bezier
        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1];
          const curr = points[i];
          const cpX = (prev.x + curr.x) / 2;
          ctx.quadraticCurveTo(prev.x, prev.y, cpX, (prev.y + curr.y) / 2);
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
        ctx.stroke();

        // Animated end point (rocket effect)
        if (state === "running") {
          const last = points[points.length - 1];
          
          // Outer glow
          ctx.beginPath();
          ctx.arc(last.x, last.y, 12, 0, Math.PI * 2);
          ctx.fillStyle = `${primaryColor}33`;
          ctx.fill();
          
          // Inner circle
          ctx.beginPath();
          ctx.arc(last.x, last.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = primaryColor;
          ctx.shadowColor = primaryColor;
          ctx.shadowBlur = 20;
          ctx.fill();
          
          // Core
          ctx.beginPath();
          ctx.arc(last.x, last.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = "#fff";
          ctx.fill();
        }

        // Crash marker
        if (state === "crashed" && points.length > 0) {
          const last = points[points.length - 1];
          
          // X mark
          ctx.strokeStyle = "#ef4444";
          ctx.lineWidth = 3;
          ctx.shadowColor = "#ef4444";
          ctx.shadowBlur = 15;
          
          const size = 10;
          ctx.beginPath();
          ctx.moveTo(last.x - size, last.y - size);
          ctx.lineTo(last.x + size, last.y + size);
          ctx.moveTo(last.x + size, last.y - size);
          ctx.lineTo(last.x - size, last.y + size);
          ctx.stroke();
        }

        ctx.shadowBlur = 0;
      }
    }

    // Continue animation if running
    if (state === "running") {
      animationRef.current = requestAnimationFrame(draw);
    }
  }, [state, multiplier, startTime, crashPoint]);

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
  }, [multiplier, state, draw, crashPoint]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [draw]);

  return (
    <div className="relative w-full h-full min-h-[300px]" ref={containerRef}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      
      {/* Overlay - Large multiplier display */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {state === "waiting" && countdown !== undefined && (
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <span className="text-[6rem] font-extralight tabular-nums text-white/90">
                {countdown}
              </span>
              {/* Pulsing ring effect */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-32 h-32 rounded-full border border-white/10 animate-ping" 
                  style={{ animationDuration: "1s" }} />
              </div>
            </div>
            <span className="text-xs uppercase tracking-[0.3em] text-white/40">
              en attente
            </span>
          </div>
        )}
        
        {state === "running" && (
          <div className="flex flex-col items-center">
            <span 
              className="text-[5rem] md:text-[7rem] font-extralight tabular-nums text-green-400"
              style={{ textShadow: "0 0 40px rgba(34, 197, 94, 0.5)" }}
            >
              {multiplier.toFixed(2)}x
            </span>
          </div>
        )}
        
        {state === "crashed" && (
          <div className="flex flex-col items-center gap-2">
            <span className="text-sm uppercase tracking-[0.3em] text-red-400/80 font-medium">
              crashed
            </span>
            <span 
              className="text-[5rem] md:text-[7rem] font-extralight tabular-nums text-red-400"
              style={{ textShadow: "0 0 40px rgba(239, 68, 68, 0.5)" }}
            >
              {(crashPoint || multiplier).toFixed(2)}x
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
