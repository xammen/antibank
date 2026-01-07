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
  
  // Store animation state persistently
  const stateRef = useRef({
    lastTime: 0,
    smoothMultiplier: 1,
    trailPoints: [] as { x: number; y: number; alpha: number }[],
    particles: [] as { x: number; y: number; vx: number; vy: number; life: number; size: number }[],
  });

  const draw = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    // Set canvas size
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    } else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    }

    const width = rect.width;
    const height = rect.height;
    const padding = { top: 40, right: 20, bottom: 40, left: 50 };
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;

    // Calculate timing
    let currentMult = 1;
    let elapsedMs = 0;
    let progress = 0; // 0 to 1
    
    if (state === "running" && startTime) {
      elapsedMs = Math.max(0, Date.now() - startTime);
      currentMult = calculateMultiplier(elapsedMs);
      // Smooth interpolation for display
      const s = stateRef.current;
      s.smoothMultiplier += (currentMult - s.smoothMultiplier) * 0.3;
      currentMult = s.smoothMultiplier;
    } else if (state === "crashed" && crashPoint) {
      elapsedMs = timeToMultiplier(crashPoint);
      currentMult = crashPoint;
      progress = 1;
    } else {
      stateRef.current.smoothMultiplier = 1;
      stateRef.current.trailPoints = [];
    }

    // Dynamic scaling with smooth transition
    const targetMaxY = Math.max(currentMult * 1.4, 2.5);
    const minY = 1;
    const maxY = targetMaxY;

    // Colors
    const isRunning = state === "running";
    const isCrashed = state === "crashed";
    const primaryColor = isCrashed ? "#ef4444" : "#22c55e";
    const glowColor = isCrashed ? "rgba(239, 68, 68, 0.4)" : "rgba(34, 197, 94, 0.4)";

    // Clear canvas with gradient background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, "#0a0a0a");
    bgGradient.addColorStop(1, "#050505");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 1;
    
    // Horizontal grid lines
    const gridSteps = maxY > 20 ? [5, 10, 20, 50, 100] : maxY > 10 ? [2, 5, 10, 20] : maxY > 5 ? [2, 3, 5, 7, 10] : [1.5, 2, 2.5, 3, 4];
    for (const y of gridSteps) {
      if (y > minY && y < maxY) {
        const yPos = padding.top + graphHeight - ((y - minY) / (maxY - minY)) * graphHeight;
        ctx.beginPath();
        ctx.moveTo(padding.left, yPos);
        ctx.lineTo(width - padding.right, yPos);
        ctx.stroke();
        
        // Labels
        ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
        ctx.font = "10px JetBrains Mono, monospace";
        ctx.textAlign = "right";
        ctx.fillText(`${y.toFixed(y >= 10 ? 0 : 1)}x`, padding.left - 8, yPos + 3);
      }
    }
    
    // Base line
    const baseY = padding.top + graphHeight;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.beginPath();
    ctx.moveTo(padding.left, baseY);
    ctx.lineTo(width - padding.right, baseY);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fillText("1.00x", padding.left - 8, baseY + 3);

    // Draw curve when running or crashed
    if ((isRunning || isCrashed) && elapsedMs > 0) {
      // Generate smooth curve points
      const totalTime = elapsedMs;
      const numPoints = Math.min(300, Math.max(100, Math.floor(totalTime / 20)));
      const points: { x: number; y: number }[] = [];
      
      for (let i = 0; i <= numPoints; i++) {
        const t = (i / numPoints) * totalTime;
        const m = calculateMultiplier(t);
        const x = padding.left + (i / numPoints) * graphWidth;
        const normalizedY = Math.min(1, (m - minY) / (maxY - minY));
        const y = padding.top + graphHeight * (1 - normalizedY);
        points.push({ x, y: Math.max(padding.top, Math.min(baseY, y)) });
      }

      if (points.length > 1) {
        // Gradient fill under curve
        const fillGradient = ctx.createLinearGradient(0, padding.top, 0, baseY);
        if (isCrashed) {
          fillGradient.addColorStop(0, "rgba(239, 68, 68, 0.15)");
          fillGradient.addColorStop(0.5, "rgba(239, 68, 68, 0.05)");
          fillGradient.addColorStop(1, "rgba(239, 68, 68, 0)");
        } else {
          fillGradient.addColorStop(0, "rgba(34, 197, 94, 0.12)");
          fillGradient.addColorStop(0.5, "rgba(34, 197, 94, 0.04)");
          fillGradient.addColorStop(1, "rgba(34, 197, 94, 0)");
        }
        
        ctx.fillStyle = fillGradient;
        ctx.beginPath();
        ctx.moveTo(points[0].x, baseY);
        
        // Smooth curve with cardinal spline
        for (let i = 0; i < points.length - 1; i++) {
          const p0 = points[Math.max(0, i - 1)];
          const p1 = points[i];
          const p2 = points[i + 1];
          const p3 = points[Math.min(points.length - 1, i + 2)];
          
          const cp1x = p1.x + (p2.x - p0.x) / 6;
          const cp1y = p1.y + (p2.y - p0.y) / 6;
          const cp2x = p2.x - (p3.x - p1.x) / 6;
          const cp2y = p2.y - (p3.y - p1.y) / 6;
          
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }
        
        ctx.lineTo(points[points.length - 1].x, baseY);
        ctx.closePath();
        ctx.fill();

        // Main curve with glow effect
        // Outer glow
        ctx.shadowColor = primaryColor;
        ctx.shadowBlur = 20;
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 0; i < points.length - 1; i++) {
          const p0 = points[Math.max(0, i - 1)];
          const p1 = points[i];
          const p2 = points[i + 1];
          const p3 = points[Math.min(points.length - 1, i + 2)];
          
          const cp1x = p1.x + (p2.x - p0.x) / 6;
          const cp1y = p1.y + (p2.y - p0.y) / 6;
          const cp2x = p2.x - (p3.x - p1.x) / 6;
          const cp2y = p2.y - (p3.y - p1.y) / 6;
          
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // End point effects
        const last = points[points.length - 1];
        
        if (isRunning) {
          // Particle trail effect
          const s = stateRef.current;
          const now = timestamp;
          
          // Add new particles
          if (now - s.lastTime > 30) {
            s.particles.push({
              x: last.x,
              y: last.y,
              vx: (Math.random() - 0.5) * 2,
              vy: Math.random() * -2 - 1,
              life: 1,
              size: Math.random() * 3 + 1,
            });
            s.lastTime = now;
          }
          
          // Update and draw particles
          s.particles = s.particles.filter(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.02;
            p.vy += 0.05; // gravity
            
            if (p.life > 0) {
              ctx.beginPath();
              ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(34, 197, 94, ${p.life * 0.6})`;
              ctx.fill();
              return true;
            }
            return false;
          });
          
          // Pulsing glow
          const pulse = Math.sin(timestamp / 100) * 0.3 + 0.7;
          
          // Outer ring
          ctx.beginPath();
          ctx.arc(last.x, last.y, 18 * pulse, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(34, 197, 94, ${0.1 * pulse})`;
          ctx.fill();
          
          // Middle ring
          ctx.beginPath();
          ctx.arc(last.x, last.y, 10 * pulse, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(34, 197, 94, ${0.3 * pulse})`;
          ctx.fill();
          
          // Core
          ctx.beginPath();
          ctx.arc(last.x, last.y, 5, 0, Math.PI * 2);
          ctx.fillStyle = "#22c55e";
          ctx.shadowColor = "#22c55e";
          ctx.shadowBlur = 15;
          ctx.fill();
          
          // White center
          ctx.beginPath();
          ctx.arc(last.x, last.y, 2, 0, Math.PI * 2);
          ctx.fillStyle = "#fff";
          ctx.fill();
          ctx.shadowBlur = 0;
          
        } else if (isCrashed) {
          // Crash explosion effect
          const crashTime = 500; // ms for explosion animation
          const timeSinceCrash = Math.min(crashTime, timestamp % (crashTime + 2000));
          const explosionProgress = timeSinceCrash / crashTime;
          
          if (explosionProgress < 1) {
            // Expanding ring
            const ringSize = 30 + explosionProgress * 40;
            ctx.beginPath();
            ctx.arc(last.x, last.y, ringSize, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(239, 68, 68, ${(1 - explosionProgress) * 0.5})`;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          
          // X mark
          ctx.strokeStyle = "#ef4444";
          ctx.lineWidth = 3;
          ctx.shadowColor = "#ef4444";
          ctx.shadowBlur = 15;
          ctx.lineCap = "round";
          
          const size = 12;
          ctx.beginPath();
          ctx.moveTo(last.x - size, last.y - size);
          ctx.lineTo(last.x + size, last.y + size);
          ctx.moveTo(last.x + size, last.y - size);
          ctx.lineTo(last.x - size, last.y + size);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }
    }

    // Continue animation
    if (state === "running") {
      animationRef.current = requestAnimationFrame(draw);
    }
  }, [state, multiplier, startTime, crashPoint]);

  // Animation loop
  useEffect(() => {
    if (state === "running") {
      animationRef.current = requestAnimationFrame(draw);
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      // Draw static state
      requestAnimationFrame(draw);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [state, draw]);

  // Redraw on prop changes
  useEffect(() => {
    if (state !== "running") {
      requestAnimationFrame(draw);
    }
  }, [multiplier, crashPoint, state, draw]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => requestAnimationFrame(draw);
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
              className="text-[5rem] md:text-[7rem] font-extralight tabular-nums text-green-400 transition-all duration-100"
              style={{ textShadow: "0 0 60px rgba(34, 197, 94, 0.5)" }}
            >
              {multiplier.toFixed(2)}x
            </span>
          </div>
        )}
        
        {state === "crashed" && (
          <div className="flex flex-col items-center gap-2 animate-pulse">
            <span className="text-sm uppercase tracking-[0.3em] text-red-400/80 font-medium">
              crashed
            </span>
            <span 
              className="text-[5rem] md:text-[7rem] font-extralight tabular-nums text-red-400"
              style={{ textShadow: "0 0 60px rgba(239, 68, 68, 0.5)" }}
            >
              {(crashPoint || multiplier).toFixed(2)}x
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
