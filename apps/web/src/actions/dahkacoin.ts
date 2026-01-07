"use server";

import { prisma } from "@antibank/db";
import { auth } from "@/lib/auth";

// ============================================
// CONFIGURATION - CHAOTIC DAHKACOIN
// ============================================

const DC_MIN_PRICE = 0.01;       // Can go VERY low
const DC_MAX_PRICE = 500;        // Can go VERY high (was 50)
const DC_INITIAL_PRICE = 1.00;
const DC_SELL_FEE = 0.02;
const DC_FAIR_VALUE = 5.00;      // Price tends toward this over long time

// ============================================
// TYPES
// ============================================

type MarketPhase = 
  | 'accumulation'   // Quiet, low volatility, price slowly building
  | 'markup'         // Uptrend beginning, momentum building
  | 'euphoria'       // MOON MODE - explosive growth
  | 'distribution'   // Top forming, choppy
  | 'decline'        // Downtrend, fear
  | 'capitulation'   // CRASH MODE - panic
  | 'recovery';      // Bottom forming

type ExtremeEvent = 
  | 'none'
  | 'whale_pump'       // Big buyer (+30% to +100%)
  | 'whale_dump'       // Big seller (-20% to -60%)
  | 'flash_crash'      // Instant -40% to -70%
  | 'mega_pump'        // Sustained +200% to +500%
  | 'liquidity_crisis' // Price frozen, then big move
  | 'fomo_wave'        // Cascading buys
  | 'panic_wave';      // Cascading sells

interface PricePoint {
  price: number;
  createdAt: Date;
}

interface MarketState {
  price: number;
  phase: MarketPhase;
  phaseStartTime: number;
  phaseDuration: number;
  momentum: number;           // -1 to 1
  volatilityMultiplier: number;
  activeEvent: ExtremeEvent;
  eventStartTime: number;
  eventDuration: number;
  eventIntensity: number;
  lastEventTime: number;
  allTimeHigh: number;
  allTimeLow: number;
  lastUpdate: number;
}

interface Signals {
  phaseWarning: boolean;
  oversold: boolean;
  overbought: boolean;
  momentumDivergence: boolean;
  whaleAlert: boolean;
}

interface DCState {
  currentPrice: number;
  phase: MarketPhase;
  phaseProgress: number;
  momentum: number;
  volatility: string;
  activeEvent: ExtremeEvent;
  eventIntensity: number;
  signals: Signals;
  allTimeHigh: number;
  allTimeLow: number;
  priceHistory: PricePoint[];
  userDC: number;
  userAvgPrice: number | null;
  userProfit: number | null;
  lastUpdate: Date | null;
}

interface TradeResult {
  success: boolean;
  error?: string;
  dcAmount?: number;
  euroAmount?: number;
  newBalance?: number;
  newDCBalance?: number;
}

// ============================================
// PHASE CONFIGURATION
// ============================================

const PHASE_DURATIONS: Record<MarketPhase, { min: number; max: number }> = {
  accumulation:  { min: 120,  max: 300  },  // 2-5 min
  markup:        { min: 60,   max: 180  },  // 1-3 min
  euphoria:      { min: 30,   max: 120  },  // 30s-2min - short!
  distribution:  { min: 60,   max: 180  },  // 1-3 min
  decline:       { min: 60,   max: 240  },  // 1-4 min
  capitulation:  { min: 15,   max: 60   },  // 15s-1min - very short!
  recovery:      { min: 120,  max: 300  },  // 2-5 min
};

const PHASE_TRANSITIONS: Record<MarketPhase, Partial<Record<MarketPhase, number>>> = {
  accumulation: { markup: 0.60, decline: 0.25, accumulation: 0.15 },
  markup: { euphoria: 0.50, distribution: 0.30, markup: 0.20 },
  euphoria: { distribution: 0.70, capitulation: 0.20, euphoria: 0.10 },
  distribution: { decline: 0.50, capitulation: 0.30, markup: 0.15, distribution: 0.05 },
  decline: { capitulation: 0.40, recovery: 0.35, decline: 0.25 },
  capitulation: { recovery: 0.80, capitulation: 0.15, accumulation: 0.05 },
  recovery: { accumulation: 0.60, markup: 0.30, decline: 0.10 },
};

// Volatility by phase (% per second)
const VOLATILITY_BY_PHASE: Record<MarketPhase, { base: number; max: number }> = {
  accumulation:  { base: 0.001, max: 0.01  },
  markup:        { base: 0.003, max: 0.03  },
  euphoria:      { base: 0.010, max: 0.10  },  // WILD
  distribution:  { base: 0.005, max: 0.05  },
  decline:       { base: 0.004, max: 0.04  },
  capitulation:  { base: 0.015, max: 0.15  },  // CHAOS
  recovery:      { base: 0.003, max: 0.03  },
};

// Event probabilities per tick
const EVENT_PROBABILITIES: Record<ExtremeEvent, number> = {
  none: 0,
  whale_pump: 0.0008,       // ~0.08%
  whale_dump: 0.0008,
  flash_crash: 0.0002,      // Rare but devastating
  mega_pump: 0.0001,        // Very rare
  liquidity_crisis: 0.0001,
  fomo_wave: 0.0005,
  panic_wave: 0.0005,
};

const EVENT_DURATIONS: Record<ExtremeEvent, { min: number; max: number }> = {
  none: { min: 0, max: 0 },
  whale_pump: { min: 10, max: 30 },
  whale_dump: { min: 10, max: 30 },
  flash_crash: { min: 5, max: 15 },
  mega_pump: { min: 60, max: 180 },   // 1-3 minutes of moon
  liquidity_crisis: { min: 30, max: 60 },
  fomo_wave: { min: 20, max: 60 },
  panic_wave: { min: 20, max: 60 },
};

const EVENT_MAGNITUDES: Record<ExtremeEvent, { min: number; max: number }> = {
  none: { min: 0, max: 0 },
  whale_pump: { min: 0.30, max: 1.00 },      // +30% to +100%
  whale_dump: { min: 0.20, max: 0.60 },      // -20% to -60%
  flash_crash: { min: 0.40, max: 0.70 },     // -40% to -70%
  mega_pump: { min: 2.00, max: 5.00 },       // +200% to +500%
  liquidity_crisis: { min: 0.30, max: 0.80 },
  fomo_wave: { min: 0.20, max: 0.50 },
  panic_wave: { min: 0.20, max: 0.50 },
};

// Phase-dependent event multipliers
const PHASE_EVENT_MULTIPLIERS: Record<MarketPhase, Partial<Record<ExtremeEvent, number>>> = {
  accumulation:  { whale_pump: 2.0, whale_dump: 0.5, flash_crash: 0.3, mega_pump: 1.5 },
  markup:        { whale_pump: 1.5, whale_dump: 0.5, flash_crash: 0.5, mega_pump: 2.0, fomo_wave: 1.5 },
  euphoria:      { whale_pump: 0.5, whale_dump: 2.0, flash_crash: 1.5, mega_pump: 0.5, fomo_wave: 2.0 },
  distribution:  { whale_pump: 0.5, whale_dump: 2.0, flash_crash: 1.0, panic_wave: 1.0 },
  decline:       { whale_pump: 0.5, whale_dump: 1.5, flash_crash: 1.5, panic_wave: 1.5 },
  capitulation:  { whale_pump: 1.0, whale_dump: 0.5, flash_crash: 0.5 },
  recovery:      { whale_pump: 1.5, whale_dump: 0.5, mega_pump: 1.0, fomo_wave: 1.0 },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function getEventDirection(event: ExtremeEvent): number {
  switch (event) {
    case 'whale_pump':
    case 'mega_pump':
    case 'fomo_wave':
      return 1;
    case 'whale_dump':
    case 'flash_crash':
    case 'panic_wave':
      return -1;
    case 'liquidity_crisis':
      return Math.random() > 0.5 ? 1 : -1;
    default:
      return 0;
  }
}

function getVolatilityName(base: number): string {
  if (base < 0.002) return 'calme';
  if (base < 0.005) return 'normal';
  if (base < 0.015) return 'volatile';
  if (base < 0.05) return 'extreme';
  return 'chaos';
}

// ============================================
// MARKET STATE MANAGEMENT
// ============================================

async function getMarketState(): Promise<MarketState> {
  const config = await prisma.$queryRaw<{ value: string }[]>`
    SELECT value::text FROM "GameConfig" WHERE key = 'dahkacoin_market'
  `;

  if (config.length === 0) {
    const now = Date.now();
    const initialState: MarketState = {
      price: DC_INITIAL_PRICE,
      phase: 'accumulation',
      phaseStartTime: now,
      phaseDuration: randomInRange(PHASE_DURATIONS.accumulation.min * 1000, PHASE_DURATIONS.accumulation.max * 1000),
      momentum: 0,
      volatilityMultiplier: 1,
      activeEvent: 'none',
      eventStartTime: 0,
      eventDuration: 0,
      eventIntensity: 0,
      lastEventTime: 0,
      allTimeHigh: DC_INITIAL_PRICE,
      allTimeLow: DC_INITIAL_PRICE,
      lastUpdate: now,
    };
    
    await prisma.$executeRaw`
      INSERT INTO "GameConfig" (key, value, "updatedAt")
      VALUES ('dahkacoin_market', ${JSON.stringify(initialState)}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(initialState)}::jsonb, "updatedAt" = NOW()
    `;

    await prisma.$executeRaw`
      INSERT INTO "DahkaCoinPrice" (id, price, trend, "createdAt")
      VALUES (gen_random_uuid()::text, ${DC_INITIAL_PRICE}, 0, NOW())
    `;

    return initialState;
  }

  return JSON.parse(config[0].value) as MarketState;
}

async function saveMarketState(state: MarketState): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "GameConfig"
    SET value = ${JSON.stringify(state)}::jsonb, "updatedAt" = NOW()
    WHERE key = 'dahkacoin_market'
  `;
}

// ============================================
// PHASE MANAGEMENT
// ============================================

function transitionPhase(state: MarketState, now: number): void {
  const transitions = PHASE_TRANSITIONS[state.phase];
  const roll = Math.random();
  let cumulative = 0;
  
  let newPhase: MarketPhase = state.phase;
  for (const [phase, probability] of Object.entries(transitions)) {
    cumulative += probability!;
    if (roll <= cumulative) {
      newPhase = phase as MarketPhase;
      break;
    }
  }
  
  state.phase = newPhase;
  state.phaseStartTime = now;
  state.phaseDuration = randomInRange(
    PHASE_DURATIONS[newPhase].min * 1000,
    PHASE_DURATIONS[newPhase].max * 1000
  );
  
  // Momentum boost on phase change
  if (newPhase === 'euphoria' || newPhase === 'markup') {
    state.momentum = Math.min(1, state.momentum + 0.3);
  } else if (newPhase === 'capitulation' || newPhase === 'decline') {
    state.momentum = Math.max(-1, state.momentum - 0.3);
  }
}

// ============================================
// EVENT MANAGEMENT
// ============================================

function checkForEvents(state: MarketState, now: number): void {
  // If event is active, update it
  if (state.activeEvent !== 'none') {
    const elapsed = now - state.eventStartTime;
    if (elapsed >= state.eventDuration) {
      state.activeEvent = 'none';
      state.eventIntensity = 0;
    } else {
      // Intensity peaks in middle
      const progress = elapsed / state.eventDuration;
      state.eventIntensity = Math.sin(progress * Math.PI);
    }
    return;
  }
  
  // Cooldown: no events within 30 seconds
  if (now - state.lastEventTime < 30000) return;
  
  // Roll for each event type
  const multipliers = PHASE_EVENT_MULTIPLIERS[state.phase];
  
  for (const [event, baseProbability] of Object.entries(EVENT_PROBABILITIES)) {
    if (event === 'none') continue;
    
    const multiplier = multipliers[event as ExtremeEvent] || 1.0;
    const probability = baseProbability * multiplier;
    
    if (Math.random() < probability) {
      state.activeEvent = event as ExtremeEvent;
      state.eventStartTime = now;
      state.eventDuration = randomInRange(
        EVENT_DURATIONS[event as ExtremeEvent].min * 1000,
        EVENT_DURATIONS[event as ExtremeEvent].max * 1000
      );
      state.eventIntensity = 0.5;
      state.lastEventTime = now;
      return;
    }
  }
}

// ============================================
// PRICE CALCULATION
// ============================================

function calculatePriceChange(state: MarketState, deltaSeconds: number): number {
  const { phase, momentum, activeEvent, eventIntensity, price } = state;
  const volatility = VOLATILITY_BY_PHASE[phase];
  
  // 1. Base random walk
  const randomComponent = (Math.random() - 0.5) * 2 * volatility.base * Math.sqrt(deltaSeconds);
  
  // 2. Momentum component
  const momentumComponent = momentum * volatility.base * 2 * deltaSeconds;
  
  // 3. Event component
  let eventComponent = 0;
  if (activeEvent !== 'none') {
    const magnitude = randomInRange(
      EVENT_MAGNITUDES[activeEvent].min,
      EVENT_MAGNITUDES[activeEvent].max
    );
    const direction = getEventDirection(activeEvent);
    eventComponent = (magnitude / (state.eventDuration / 1000)) * eventIntensity * direction * deltaSeconds;
  }
  
  // 4. Mean reversion (very weak, only at extremes)
  let meanReversionComponent = 0;
  if (price > DC_FAIR_VALUE * 20) {
    meanReversionComponent = -0.0001 * (price / DC_FAIR_VALUE) * deltaSeconds;
  } else if (price < DC_FAIR_VALUE * 0.05) {
    meanReversionComponent = 0.0001 * (DC_FAIR_VALUE / price) * deltaSeconds;
  }
  
  // 5. Volatility spike (5% chance per tick)
  let volatilitySpike = 0;
  if (Math.random() < 0.05) {
    volatilitySpike = (Math.random() - 0.5) * volatility.max;
  }
  
  return randomComponent + momentumComponent + eventComponent + meanReversionComponent + volatilitySpike;
}

// ============================================
// PRICE UPDATES
// ============================================

export async function tickPrice(): Promise<{ 
  price: number; 
  phase: MarketPhase;
  phaseProgress: number;
  momentum: number;
  volatility: string;
  activeEvent: ExtremeEvent;
  eventIntensity: number;
  signals: Signals;
  allTimeHigh: number;
  allTimeLow: number;
}> {
  const state = await getMarketState();
  const now = Date.now();
  const deltaSeconds = Math.min(10, (now - state.lastUpdate) / 1000);
  
  if (deltaSeconds < 0.5) {
    const phaseProgress = Math.min(1, (now - state.phaseStartTime) / state.phaseDuration);
    return {
      price: state.price,
      phase: state.phase,
      phaseProgress,
      momentum: state.momentum,
      volatility: getVolatilityName(VOLATILITY_BY_PHASE[state.phase].base),
      activeEvent: state.activeEvent,
      eventIntensity: state.eventIntensity,
      signals: {
        phaseWarning: phaseProgress > 0.8,
        oversold: false,
        overbought: false,
        momentumDivergence: false,
        whaleAlert: ['whale_pump', 'whale_dump', 'mega_pump'].includes(state.activeEvent),
      },
      allTimeHigh: state.allTimeHigh,
      allTimeLow: state.allTimeLow,
    };
  }

  // Update phase progress
  const elapsed = now - state.phaseStartTime;
  if (elapsed >= state.phaseDuration) {
    transitionPhase(state, now);
  }
  
  // Check for events
  checkForEvents(state, now);
  
  // Update momentum with decay
  state.momentum *= 0.995;
  
  // Phase influences momentum
  const phaseInfluence: Record<MarketPhase, number> = {
    accumulation: 0.001,
    markup: 0.005,
    euphoria: 0.01,
    distribution: -0.002,
    decline: -0.005,
    capitulation: -0.01,
    recovery: 0.003,
  };
  state.momentum += phaseInfluence[state.phase] * deltaSeconds;
  state.momentum = Math.max(-1, Math.min(1, state.momentum));
  
  // Calculate price change
  const priceChange = calculatePriceChange(state, deltaSeconds);
  let newPrice = state.price * (1 + priceChange);
  
  // Apply bounds with bounce
  if (newPrice < DC_MIN_PRICE) {
    newPrice = DC_MIN_PRICE * (1 + Math.random() * 0.1);
    state.momentum = Math.abs(state.momentum) * 0.5;
  }
  if (newPrice > DC_MAX_PRICE) {
    newPrice = DC_MAX_PRICE * (1 - Math.random() * 0.1);
    state.momentum = -Math.abs(state.momentum) * 0.5;
  }
  
  newPrice = Math.round(newPrice * 10000) / 10000;
  
  // Update ATH/ATL
  state.allTimeHigh = Math.max(state.allTimeHigh, newPrice);
  state.allTimeLow = Math.min(state.allTimeLow, newPrice);
  
  const previousPrice = state.price;
  state.price = newPrice;
  state.lastUpdate = now;

  await saveMarketState(state);

  // Save price point (every ~5 seconds)
  if (deltaSeconds >= 5) {
    const trendValue = Math.round(state.momentum * 10);
    await prisma.$executeRaw`
      INSERT INTO "DahkaCoinPrice" (id, price, trend, "createdAt")
      VALUES (gen_random_uuid()::text, ${newPrice}, ${trendValue}, NOW())
    `;
  }

  // Calculate signals
  const phaseProgress = Math.min(1, (now - state.phaseStartTime) / state.phaseDuration);
  const priceDirection = newPrice > previousPrice ? 1 : -1;
  const momentumDirection = state.momentum > 0 ? 1 : -1;
  
  return {
    price: newPrice,
    phase: state.phase,
    phaseProgress,
    momentum: state.momentum,
    volatility: getVolatilityName(VOLATILITY_BY_PHASE[state.phase].base),
    activeEvent: state.activeEvent,
    eventIntensity: state.eventIntensity,
    signals: {
      phaseWarning: phaseProgress > 0.8,
      oversold: priceChange < -0.10,
      overbought: priceChange > 0.15,
      momentumDivergence: priceDirection !== momentumDirection && Math.abs(state.momentum) > 0.3,
      whaleAlert: ['whale_pump', 'whale_dump', 'mega_pump'].includes(state.activeEvent),
    },
    allTimeHigh: state.allTimeHigh,
    allTimeLow: state.allTimeLow,
  };
}

export async function getCurrentPrice(): Promise<{ price: number; trend: number }> {
  const state = await getMarketState();
  return { price: state.price, trend: Math.round(state.momentum * 2) };
}

// ============================================
// TRADING
// ============================================

export async function buyDahkaCoin(euroAmount: number): Promise<TradeResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  if (euroAmount <= 0 || euroAmount < 0.10) {
    return { success: false, error: "minimum 0.10eur" };
  }

  const userId = session.user.id;

  const userData = await prisma.$queryRaw<{ balance: string; dahkaCoins: string; dcAvgBuyPrice: string | null }[]>`
    SELECT balance::text, "dahkaCoins"::text, "dcAvgBuyPrice"::text
    FROM "User" WHERE id = ${userId}
  `;

  if (userData.length === 0) {
    return { success: false, error: "utilisateur introuvable" };
  }

  const balance = parseFloat(userData[0].balance);
  const currentDC = parseFloat(userData[0].dahkaCoins);
  const currentAvgPrice = userData[0].dcAvgBuyPrice ? parseFloat(userData[0].dcAvgBuyPrice) : null;

  if (balance < euroAmount) {
    return { success: false, error: "pas assez de thunes" };
  }

  const { price } = await getCurrentPrice();
  const dcAmount = euroAmount / price;

  let newAvgPrice: number;
  if (currentAvgPrice === null || currentDC === 0) {
    newAvgPrice = price;
  } else {
    const totalValue = (currentDC * currentAvgPrice) + euroAmount;
    const totalDC = currentDC + dcAmount;
    newAvgPrice = totalValue / totalDC;
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE "User"
      SET balance = balance - ${euroAmount},
          "dahkaCoins" = "dahkaCoins" + ${dcAmount},
          "dcAvgBuyPrice" = ${newAvgPrice},
          "updatedAt" = NOW()
      WHERE id = ${userId}
    `;

    await tx.$executeRaw`
      INSERT INTO "DahkaCoinTx" (id, "userId", type, "dcAmount", "euroAmount", price, "createdAt")
      VALUES (gen_random_uuid()::text, ${userId}, 'buy', ${dcAmount}, ${euroAmount}, ${price}, NOW())
    `;

    await tx.$executeRaw`
      INSERT INTO "Transaction" (id, "userId", type, amount, description, "createdAt")
      VALUES (gen_random_uuid()::text, ${userId}, 'dc_buy', ${-euroAmount}, ${'achat ' + dcAmount.toFixed(4) + ' DC @ ' + price.toFixed(4) + 'eur'}, NOW())
    `;
  });

  return {
    success: true,
    dcAmount,
    euroAmount,
    newBalance: balance - euroAmount,
    newDCBalance: currentDC + dcAmount,
  };
}

export async function sellDahkaCoin(dcAmount: number): Promise<TradeResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  if (dcAmount <= 0) {
    return { success: false, error: "montant invalide" };
  }

  const userId = session.user.id;

  const userData = await prisma.$queryRaw<{ balance: string; dahkaCoins: string }[]>`
    SELECT balance::text, "dahkaCoins"::text FROM "User" WHERE id = ${userId}
  `;

  if (userData.length === 0) {
    return { success: false, error: "utilisateur introuvable" };
  }

  const balance = parseFloat(userData[0].balance);
  const currentDC = parseFloat(userData[0].dahkaCoins);

  if (currentDC < dcAmount) {
    return { success: false, error: "pas assez de DC" };
  }

  const { price } = await getCurrentPrice();
  const grossEuros = dcAmount * price;
  const fee = grossEuros * DC_SELL_FEE;
  const netEuros = grossEuros - fee;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE "User"
      SET balance = balance + ${netEuros},
          "dahkaCoins" = "dahkaCoins" - ${dcAmount},
          "updatedAt" = NOW()
      WHERE id = ${userId}
    `;

    const remainingDC = currentDC - dcAmount;
    if (remainingDC <= 0.0001) {
      await tx.$executeRaw`
        UPDATE "User" SET "dcAvgBuyPrice" = NULL WHERE id = ${userId}
      `;
    }

    await tx.$executeRaw`
      INSERT INTO "DahkaCoinTx" (id, "userId", type, "dcAmount", "euroAmount", price, "createdAt")
      VALUES (gen_random_uuid()::text, ${userId}, 'sell', ${dcAmount}, ${netEuros}, ${price}, NOW())
    `;

    await tx.$executeRaw`
      INSERT INTO "Transaction" (id, "userId", type, amount, description, "createdAt")
      VALUES (gen_random_uuid()::text, ${userId}, 'dc_sell', ${netEuros}, ${'vente ' + dcAmount.toFixed(4) + ' DC @ ' + price.toFixed(4) + 'eur (frais: ' + fee.toFixed(2) + 'eur)'}, NOW())
    `;
  });

  return {
    success: true,
    dcAmount,
    euroAmount: netEuros,
    newBalance: balance + netEuros,
    newDCBalance: currentDC - dcAmount,
  };
}

// ============================================
// STATE
// ============================================

export async function getDCState(period: "1h" | "24h" | "7d" = "1h"): Promise<DCState> {
  const session = await auth();
  const marketState = await getMarketState();
  const now = Date.now();

  // Calculate period filter
  const periodMs = period === "1h" ? 3600000 : period === "24h" ? 86400000 : 604800000;
  
  // Get price history from DB
  const history = await prisma.$queryRaw<{ price: string; createdAt: Date }[]>`
    SELECT price::text, "createdAt"
    FROM "DahkaCoinPrice"
    WHERE "createdAt" > NOW() - INTERVAL '7 days'
    ORDER BY "createdAt" ASC
  `;

  const nowDate = new Date();
  const filteredHistory = history.filter(h => nowDate.getTime() - new Date(h.createdAt).getTime() < periodMs);

  const priceHistory = filteredHistory.map(h => ({
    price: parseFloat(h.price),
    createdAt: h.createdAt,
  }));

  const lastUpdate = history.length > 0 ? history[history.length - 1].createdAt : null;

  // Calculate phase progress
  const phaseProgress = Math.min(1, (now - marketState.phaseStartTime) / marketState.phaseDuration);

  let userDC = 0;
  let userAvgPrice: number | null = null;
  let userProfit: number | null = null;

  if (session?.user?.id) {
    const userData = await prisma.$queryRaw<{ dahkaCoins: string; dcAvgBuyPrice: string | null }[]>`
      SELECT "dahkaCoins"::text, "dcAvgBuyPrice"::text FROM "User" WHERE id = ${session.user.id}
    `;

    if (userData.length > 0) {
      userDC = parseFloat(userData[0].dahkaCoins);
      userAvgPrice = userData[0].dcAvgBuyPrice ? parseFloat(userData[0].dcAvgBuyPrice) : null;
      
      if (userAvgPrice !== null && userDC > 0) {
        userProfit = (marketState.price - userAvgPrice) * userDC;
      }
    }
  }

  // Calculate signals based on recent price changes
  const recentPrices = priceHistory.slice(-30);
  const oldPrice = recentPrices.length > 0 ? recentPrices[0].price : marketState.price;
  const recentChange = (marketState.price - oldPrice) / oldPrice;

  return {
    currentPrice: marketState.price,
    phase: marketState.phase,
    phaseProgress,
    momentum: marketState.momentum,
    volatility: getVolatilityName(VOLATILITY_BY_PHASE[marketState.phase].base),
    activeEvent: marketState.activeEvent,
    eventIntensity: marketState.eventIntensity,
    signals: {
      phaseWarning: phaseProgress > 0.8,
      oversold: recentChange < -0.30,
      overbought: recentChange > 0.50,
      momentumDivergence: false, // Would need more context
      whaleAlert: ['whale_pump', 'whale_dump', 'mega_pump'].includes(marketState.activeEvent),
    },
    allTimeHigh: marketState.allTimeHigh,
    allTimeLow: marketState.allTimeLow,
    priceHistory,
    userDC,
    userAvgPrice,
    userProfit,
    lastUpdate,
  };
}

export async function getDCTransactions(limit: number = 20): Promise<{
  id: string;
  type: string;
  dcAmount: number;
  euroAmount: number;
  price: number;
  createdAt: Date;
}[]> {
  const session = await auth();
  if (!session?.user?.id) return [];

  const txs = await prisma.$queryRaw<{
    id: string;
    type: string;
    dcAmount: string;
    euroAmount: string;
    price: string;
    createdAt: Date;
  }[]>`
    SELECT id, type, "dcAmount"::text, "euroAmount"::text, price::text, "createdAt"
    FROM "DahkaCoinTx"
    WHERE "userId" = ${session.user.id}
    ORDER BY "createdAt" DESC
    LIMIT ${limit}
  `;

  return txs.map(tx => ({
    id: tx.id,
    type: tx.type,
    dcAmount: parseFloat(tx.dcAmount),
    euroAmount: parseFloat(tx.euroAmount),
    price: parseFloat(tx.price),
    createdAt: tx.createdAt,
  }));
}
