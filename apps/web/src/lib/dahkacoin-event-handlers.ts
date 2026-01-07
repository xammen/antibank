// ============================================
// DAHKACOIN EVENT HANDLERS
// ============================================
// Implementation logic for special event effects

import { prisma } from "@antibank/db";
import type { DCEvent, MarketPhase, EventEffect } from "./dahkacoin-events";
import { DC_EVENTS } from "./dahkacoin-events";

// ============================================
// TYPES
// ============================================

export interface ActiveEventState {
  eventId: string;
  startTime: number;
  duration: number;
  intensity: number;
  effectsApplied: boolean;
  metadata?: Record<string, unknown>;
}

export interface MarketModifiers {
  volatilityMultiplier: number;
  feeMultiplier: number;
  tradingEnabled: boolean;
  buyEnabled: boolean;
  sellEnabled: boolean;
  priceVisible: boolean;
  holdingsVisible: boolean;
}

// ============================================
// SPECIAL EVENT HANDLERS
// ============================================

/**
 * Dead Cat Bounce - triggers secondary drop after bounce ends
 */
export async function triggerSecondaryDrop(
  currentPrice: number,
  momentum: number
): Promise<{ newPrice: number; newMomentum: number }> {
  // Drop 30-50% after the bounce
  const dropPercent = 0.30 + Math.random() * 0.20;
  const newPrice = currentPrice * (1 - dropPercent);
  const newMomentum = Math.max(-1, momentum - 0.5);
  
  return { newPrice, newMomentum };
}

/**
 * Calm Before Storm - triggers volatility explosion after calm period
 */
export async function triggerVolatilityExplosion(
  currentPrice: number,
  momentum: number
): Promise<{ newPrice: number; newMomentum: number; volatilityMultiplier: number }> {
  // Random direction, big move
  const direction = Math.random() > 0.5 ? 1 : -1;
  const movePercent = 0.20 + Math.random() * 0.40;  // 20-60% move
  const newPrice = currentPrice * (1 + direction * movePercent);
  const newMomentum = direction * (0.5 + Math.random() * 0.5);
  
  return { 
    newPrice, 
    newMomentum, 
    volatilityMultiplier: 5.0  // Extreme volatility for next 30 seconds
  };
}

/**
 * Time Loop - reverts price to 5 minutes ago
 */
export async function revertPriceHistory(): Promise<{ 
  revertedPrice: number; 
  message: string 
}> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  
  const oldPrice = await prisma.$queryRaw<{ price: string }[]>`
    SELECT price::text FROM "DahkaCoinPrice"
    WHERE "createdAt" <= ${fiveMinutesAgo}
    ORDER BY "createdAt" DESC
    LIMIT 1
  `;
  
  if (oldPrice.length === 0) {
    return { revertedPrice: 1.0, message: "Pas assez d'historique, prix reset a 1.00" };
  }
  
  const revertedPrice = parseFloat(oldPrice[0].price);
  return { 
    revertedPrice, 
    message: `Prix revenu a ${revertedPrice.toFixed(4)}€ (il y a 5 min)`
  };
}

/**
 * Forced Transition - pick random phase
 */
export function getRandomPhase(currentPhase: MarketPhase): MarketPhase {
  const phases: MarketPhase[] = [
    'accumulation', 'markup', 'euphoria', 
    'distribution', 'decline', 'capitulation', 'recovery'
  ];
  
  // Remove current phase to ensure transition
  const availablePhases = phases.filter(p => p !== currentPhase);
  return availablePhases[Math.floor(Math.random() * availablePhases.length)];
}

/**
 * Diamond Hands Bonus - give bonus DC to all holders
 */
export async function applyDiamondHandsBonus(bonusPercent: number): Promise<{
  affectedUsers: number;
  totalBonusDistributed: number;
}> {
  // Get all users with DC > 0
  const holders = await prisma.$queryRaw<{ id: string; dahkaCoins: string }[]>`
    SELECT id, "dahkaCoins"::text FROM "User" WHERE "dahkaCoins" > 0
  `;
  
  let totalBonus = 0;
  
  for (const holder of holders) {
    const currentDC = parseFloat(holder.dahkaCoins);
    const bonus = currentDC * bonusPercent;
    totalBonus += bonus;
    
    await prisma.$executeRaw`
      UPDATE "User"
      SET "dahkaCoins" = "dahkaCoins" + ${bonus}
      WHERE id = ${holder.id}
    `;
    
    await prisma.$executeRaw`
      INSERT INTO "DahkaCoinTx" (id, "userId", type, "dcAmount", "euroAmount", price, "createdAt")
      VALUES (gen_random_uuid()::text, ${holder.id}, 'bonus', ${bonus}, 0, 0, NOW())
    `;
  }
  
  return {
    affectedUsers: holders.length,
    totalBonusDistributed: totalBonus,
  };
}

/**
 * Paper Hands Tax / Burn Event - tax all holders
 */
export async function applyHoldersTax(taxPercent: number): Promise<{
  affectedUsers: number;
  totalTaxCollected: number;
}> {
  const holders = await prisma.$queryRaw<{ id: string; dahkaCoins: string }[]>`
    SELECT id, "dahkaCoins"::text FROM "User" WHERE "dahkaCoins" > 0
  `;
  
  let totalTax = 0;
  
  for (const holder of holders) {
    const currentDC = parseFloat(holder.dahkaCoins);
    const tax = currentDC * taxPercent;
    totalTax += tax;
    
    await prisma.$executeRaw`
      UPDATE "User"
      SET "dahkaCoins" = "dahkaCoins" - ${tax}
      WHERE id = ${holder.id}
    `;
    
    await prisma.$executeRaw`
      INSERT INTO "DahkaCoinTx" (id, "userId", type, "dcAmount", "euroAmount", price, "createdAt")
      VALUES (gen_random_uuid()::text, ${holder.id}, 'burn', ${-tax}, 0, 0, NOW())
    `;
  }
  
  return {
    affectedUsers: holders.length,
    totalTaxCollected: totalTax,
  };
}

/**
 * Communist Redistribution - shuffle all DC holdings
 */
export async function shuffleHoldings(): Promise<{
  affectedUsers: number;
  message: string;
}> {
  const holders = await prisma.$queryRaw<{ id: string; dahkaCoins: string }[]>`
    SELECT id, "dahkaCoins"::text FROM "User" WHERE "dahkaCoins" > 0
  `;
  
  if (holders.length < 2) {
    return { affectedUsers: 0, message: "Pas assez de holders pour redistribuer" };
  }
  
  // Collect all DC amounts
  const amounts = holders.map(h => parseFloat(h.dahkaCoins));
  
  // Shuffle array (Fisher-Yates)
  for (let i = amounts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [amounts[i], amounts[j]] = [amounts[j], amounts[i]];
  }
  
  // Redistribute
  for (let i = 0; i < holders.length; i++) {
    const oldAmount = parseFloat(holders[i].dahkaCoins);
    const newAmount = amounts[i];
    
    await prisma.$executeRaw`
      UPDATE "User"
      SET "dahkaCoins" = ${newAmount}
      WHERE id = ${holders[i].id}
    `;
    
    await prisma.$executeRaw`
      INSERT INTO "DahkaCoinTx" (id, "userId", type, "dcAmount", "euroAmount", price, "createdAt")
      VALUES (gen_random_uuid()::text, ${holders[i].id}, 'redistribute', ${newAmount - oldAmount}, 0, 0, NOW())
    `;
  }
  
  return {
    affectedUsers: holders.length,
    message: `☭ ${holders.length} comptes ont ete redistribues!`,
  };
}

/**
 * Daily Lottery - random holder wins 10% of total DC
 */
export async function runDailyLottery(): Promise<{
  winner: { id: string; name: string } | null;
  prize: number;
  message: string;
}> {
  const holders = await prisma.$queryRaw<{ id: string; name: string; dahkaCoins: string }[]>`
    SELECT id, name, "dahkaCoins"::text FROM "User" WHERE "dahkaCoins" > 0
  `;
  
  if (holders.length === 0) {
    return { winner: null, prize: 0, message: "Pas de participants a la loterie" };
  }
  
  // Calculate total DC
  const totalDC = holders.reduce((sum, h) => sum + parseFloat(h.dahkaCoins), 0);
  const prize = totalDC * 0.10;
  
  // Pick random winner (weighted by holdings)
  let random = Math.random() * totalDC;
  let winner = holders[0];
  
  for (const holder of holders) {
    random -= parseFloat(holder.dahkaCoins);
    if (random <= 0) {
      winner = holder;
      break;
    }
  }
  
  // Give prize
  await prisma.$executeRaw`
    UPDATE "User"
    SET "dahkaCoins" = "dahkaCoins" + ${prize}
    WHERE id = ${winner.id}
  `;
  
  await prisma.$executeRaw`
    INSERT INTO "DahkaCoinTx" (id, "userId", type, "dcAmount", "euroAmount", price, "createdAt")
    VALUES (gen_random_uuid()::text, ${winner.id}, 'lottery', ${prize}, 0, 0, NOW())
  `;
  
  return {
    winner: { id: winner.id, name: winner.name },
    prize,
    message: `🎰 ${winner.name} a gagne ${prize.toFixed(4)} DC a la loterie!`,
  };
}

/**
 * Reveal Holdings - get all holder positions
 */
export async function getHoldingsLeaderboard(): Promise<{
  holders: { name: string; amount: number; percentage: number }[];
  totalDC: number;
}> {
  const holders = await prisma.$queryRaw<{ name: string; dahkaCoins: string }[]>`
    SELECT name, "dahkaCoins"::text FROM "User" 
    WHERE "dahkaCoins" > 0
    ORDER BY "dahkaCoins" DESC
    LIMIT 20
  `;
  
  const totalDC = holders.reduce((sum, h) => sum + parseFloat(h.dahkaCoins), 0);
  
  return {
    holders: holders.map(h => ({
      name: h.name,
      amount: parseFloat(h.dahkaCoins),
      percentage: (parseFloat(h.dahkaCoins) / totalDC) * 100,
    })),
    totalDC,
  };
}

// ============================================
// MARKET MODIFIER CALCULATOR
// ============================================

export function calculateMarketModifiers(activeEvent: ActiveEventState | null): MarketModifiers {
  const defaults: MarketModifiers = {
    volatilityMultiplier: 1.0,
    feeMultiplier: 1.0,
    tradingEnabled: true,
    buyEnabled: true,
    sellEnabled: true,
    priceVisible: true,
    holdingsVisible: false,
  };
  
  if (!activeEvent) return defaults;
  
  const event = DC_EVENTS[activeEvent.eventId];
  if (!event) return defaults;
  
  const effects = event.effects;
  
  return {
    volatilityMultiplier: effects.volatilityMultiplier ?? (effects.doubleVolatility ? 2.0 : 1.0),
    feeMultiplier: effects.doubleFees ? 2.0 : (effects.zeroFees ? 0 : 1.0),
    tradingEnabled: !effects.disableTrading,
    buyEnabled: !effects.sellOnly,
    sellEnabled: !effects.buyOnly,
    priceVisible: !effects.quantumPrice,
    holdingsVisible: effects.revealHoldings ?? false,
  };
}

// ============================================
// PRICE IMPACT CALCULATOR
// ============================================

export function calculateEventPriceImpact(
  event: DCEvent,
  currentPrice: number,
  intensity: number,
  elapsedSeconds: number,
  totalDurationSeconds: number
): number {
  const impact = event.effects.priceImpact;
  if (!impact) return 0;
  
  // Base magnitude
  const magnitude = impact.min + (impact.max - impact.min) * intensity;
  
  // Direction
  let direction: number;
  if (impact.direction === 'up') direction = 1;
  else if (impact.direction === 'down') direction = -1;
  else direction = Math.random() > 0.5 ? 1 : -1;
  
  // Curve shape
  const progress = elapsedSeconds / totalDurationSeconds;
  let curveMultiplier: number;
  
  switch (impact.curve) {
    case 'spike':
      // Sharp peak in the middle
      curveMultiplier = Math.sin(progress * Math.PI);
      break;
    case 'exponential':
      // Accelerating
      curveMultiplier = Math.pow(progress, 2);
      break;
    case 'oscillating':
      // Waves
      curveMultiplier = Math.sin(progress * Math.PI * 4) * 0.5 + 0.5;
      break;
    case 'linear':
    default:
      curveMultiplier = progress;
  }
  
  // Calculate per-second impact (spread over duration)
  const perSecondImpact = (magnitude / totalDurationSeconds) * curveMultiplier * direction;
  
  return perSecondImpact;
}

// ============================================
// EVENT ANNOUNCEMENT MESSAGES
// ============================================

export function getEventAnnouncement(event: DCEvent, isStart: boolean, metadata?: Record<string, unknown>): string {
  if (isStart) {
    return `${event.emoji} **${event.name}**\n${event.description}`;
  } else {
    // End message
    switch (event.id) {
      case 'dead_cat_bounce':
        return `${event.emoji} Le rebond est termine... et le prix rechute!`;
      case 'calm_before_storm':
        return `🌪️ LA TEMPETE ARRIVE! Le calme est termine!`;
      case 'trading_halt':
        return `✅ Les echanges reprennent!`;
      case 'diamond_hands_bonus':
        const bonus = metadata?.totalBonus as number ?? 0;
        return `💎 Bonus distribue: ${bonus.toFixed(4)} DC total!`;
      case 'communist_redistribution':
        return `☭ La redistribution est terminee! Verifiez vos comptes!`;
      default:
        return `${event.emoji} ${event.name} est termine.`;
    }
  }
}

// ============================================
// SCHEDULED EVENT INITIALIZATION
// ============================================

export function initializeScheduledEvents(): { eventId: string; nextTriggerTime: number; warningShown: boolean }[] {
  const scheduledEvents = Object.values(DC_EVENTS).filter(e => e.schedule);
  const now = Date.now();
  
  return scheduledEvents.map(event => {
    let nextTrigger: number;
    
    switch (event.schedule!.type) {
      case 'interval':
        // Random offset within first interval
        nextTrigger = now + Math.random() * event.schedule!.value * 1000;
        break;
      case 'random_window':
        nextTrigger = now + Math.random() * event.schedule!.value * 1000;
        break;
      case 'countdown':
        nextTrigger = now + event.schedule!.value * 1000;
        break;
      default:
        nextTrigger = now + 3600000; // 1 hour default
    }
    
    return {
      eventId: event.id,
      nextTriggerTime: nextTrigger,
      warningShown: false,
    };
  });
}
