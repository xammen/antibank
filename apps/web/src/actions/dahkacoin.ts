"use server";

import { prisma } from "@antibank/db";
import { auth } from "@/lib/auth";

// ============================================
// CONFIGURATION
// ============================================

const DC_MIN_PRICE = 0.50;    // Floor raised - never below 0.50€
const DC_MAX_PRICE = 50;      // Cap lowered - never above 50€
const DC_INITIAL_PRICE = 3.00;
const DC_SELL_FEE = 0.02;
const DC_FAIR_VALUE = 3.00;   // Target 1-10€ normal, 15-25€ rare pumps

// ============================================
// TYPES
// ============================================

type MarketPhase = 
  | 'accumulation'
  | 'markup'
  | 'euphoria'
  | 'distribution'
  | 'decline'
  | 'capitulation'
  | 'recovery';

type MarketEvent = 
  | 'none'
  | 'whale_pump'
  | 'whale_dump'
  | 'flash_crash'
  | 'mega_pump'
  | 'fomo_wave'
  | 'panic_wave'
  | 'short_squeeze'
  | 'rug_pull'
  | 'dead_cat_bounce'
  | 'calm_before_storm'
  | 'volatility_storm'
  | 'price_freeze'
  | 'momentum_flip'
  | 'mystery_whale'
  | 'double_or_nothing'
  | 'golden_hour';

interface MarketState {
  price: number;
  phase: MarketPhase;
  phaseStartTime: number;
  phaseDuration: number;
  momentum: number;
  activeEvent: MarketEvent;
  eventStartTime: number;
  eventDuration: number;
  eventDirection: number;  // For mystery_whale reveal
  nextEventIn: number;     // Countdown to next event check
  allTimeHigh: number;
  allTimeLow: number;
  lastUpdate: number;
  // Anti-pump regulation
  recentPumps: number;     // Count of recent pump events
  recentCrashes: number;   // Count of recent crash events
  lastRegulationCheck: number;
}

interface DCState {
  currentPrice: number;
  phase: MarketPhase;
  phaseProgress: number;
  phaseTimeLeft: number;
  momentum: number;
  volatility: string;
  activeEvent: MarketEvent;
  eventProgress: number;
  eventTimeLeft: number;
  nextEventIn: number;
  nextPhaseProbs: Record<MarketPhase, number>;
  eventProbs: { pump: number; crash: number; chaos: number };
  allTimeHigh: number;
  allTimeLow: number;
  priceHistory: { price: number; createdAt: Date }[];
  userDC: number;
  userAvgPrice: number | null;
  userProfit: number | null;
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
// PHASE CONFIG - Dynamic probabilities
// ============================================

// Phase durations - designed for realistic crypto feel
// Bull runs are SHORT and explosive, bear markets DRAG ON
const PHASE_DURATIONS: Record<MarketPhase, { min: number; max: number }> = {
  accumulation: { min: 90, max: 180 },   // 1.5-3min - time to position, quiet
  markup: { min: 45, max: 90 },          // 45s-1.5min - building momentum
  euphoria: { min: 20, max: 45 },        // 20-45s - SHORT! FOMO, explosive but brief
  distribution: { min: 60, max: 120 },   // 1-2min - choppy, whales exiting
  decline: { min: 90, max: 150 },        // 1.5-2.5min - slow bleed
  capitulation: { min: 120, max: 240 },  // 2-4min - LONG pain, despair
  recovery: { min: 90, max: 180 },       // 1.5-3min - slow rebuild, hope returning
};

const EVENT_CHECK_INTERVAL = { min: 45, max: 75 }; // 45-75s between event checks

// Base transition probabilities - modified by momentum and price
function calculatePhaseTransitions(
  currentPhase: MarketPhase,
  momentum: number,
  price: number
): Record<MarketPhase, number> {
  const bullishBias = momentum * 0.3;
  const priceLevel = price / DC_FAIR_VALUE;
  const highPriceBias = priceLevel > 2 ? -0.2 : priceLevel < 0.5 ? 0.2 : 0;
  
  const phases: MarketPhase[] = ['accumulation', 'markup', 'euphoria', 'distribution', 'decline', 'capitulation', 'recovery'];
  const probs: Record<MarketPhase, number> = {
    accumulation: 0,
    markup: 0,
    euphoria: 0,
    distribution: 0,
    decline: 0,
    capitulation: 0,
    recovery: 0,
  };
  
  // Base probabilities depend on current phase
  switch (currentPhase) {
    case 'accumulation':
      probs.markup = 0.35 + bullishBias;
      probs.accumulation = 0.25;
      probs.decline = 0.15 - bullishBias;
      probs.euphoria = 0.10 + bullishBias;
      probs.recovery = 0.10;
      probs.distribution = 0.05;
      break;
    case 'markup':
      probs.euphoria = 0.35 + bullishBias;
      probs.markup = 0.25;
      probs.distribution = 0.20 + highPriceBias;
      probs.accumulation = 0.10;
      probs.decline = 0.10 - bullishBias;
      break;
    case 'euphoria':
      // Euphoria is SHORT and leads to crash - the party doesn't last
      probs.distribution = 0.45 + highPriceBias;
      probs.capitulation = 0.30;
      probs.decline = 0.15;
      probs.euphoria = 0.05 - highPriceBias;  // Very unlikely to stay in euphoria
      probs.markup = 0.05;
      break;
    case 'distribution':
      probs.decline = 0.35 - bullishBias;
      probs.capitulation = 0.25 - bullishBias;
      probs.distribution = 0.15;
      probs.markup = 0.15 + bullishBias;
      probs.accumulation = 0.10;
      break;
    case 'decline':
      probs.capitulation = 0.30 - bullishBias;
      probs.decline = 0.25;
      probs.recovery = 0.20 + bullishBias;
      probs.accumulation = 0.15;
      probs.distribution = 0.10;
      break;
    case 'capitulation':
      probs.recovery = 0.45 + bullishBias;
      probs.accumulation = 0.25;
      probs.capitulation = 0.15 - bullishBias;
      probs.decline = 0.10;
      probs.markup = 0.05;
      break;
    case 'recovery':
      probs.accumulation = 0.35;
      probs.markup = 0.30 + bullishBias;
      probs.recovery = 0.15;
      probs.decline = 0.10 - bullishBias;
      probs.euphoria = 0.10;
      break;
  }
  
  // Normalize to sum to 1
  const total = Object.values(probs).reduce((a, b) => a + b, 0);
  for (const phase of phases) {
    probs[phase] = Math.max(0, probs[phase] / total);
  }
  
  return probs;
}

// ============================================
// EVENT CONFIG
// ============================================

const EVENT_CONFIG: Record<MarketEvent, {
  duration: { min: number; max: number };
  magnitude: { min: number; max: number };
  direction: 'up' | 'down' | 'random' | 'none';
  cooldown: number;
}> = {
  // Magnitudes reduced ~50% to keep price in 1-10€ range
  none: { duration: { min: 0, max: 0 }, magnitude: { min: 0, max: 0 }, direction: 'none', cooldown: 0 },
  whale_pump: { duration: { min: 15, max: 45 }, magnitude: { min: 0.15, max: 0.50 }, direction: 'up', cooldown: 30 },
  whale_dump: { duration: { min: 15, max: 45 }, magnitude: { min: 0.10, max: 0.35 }, direction: 'down', cooldown: 30 },
  flash_crash: { duration: { min: 5, max: 15 }, magnitude: { min: 0.20, max: 0.40 }, direction: 'down', cooldown: 60 },
  mega_pump: { duration: { min: 60, max: 180 }, magnitude: { min: 0.80, max: 1.50 }, direction: 'up', cooldown: 120 },
  fomo_wave: { duration: { min: 30, max: 90 }, magnitude: { min: 0.10, max: 0.30 }, direction: 'up', cooldown: 45 },
  panic_wave: { duration: { min: 30, max: 90 }, magnitude: { min: 0.10, max: 0.30 }, direction: 'down', cooldown: 45 },
  short_squeeze: { duration: { min: 20, max: 60 }, magnitude: { min: 0.25, max: 0.60 }, direction: 'up', cooldown: 60 },
  rug_pull: { duration: { min: 10, max: 30 }, magnitude: { min: 0.40, max: 0.60 }, direction: 'down', cooldown: 180 },
  dead_cat_bounce: { duration: { min: 60, max: 120 }, magnitude: { min: 0.10, max: 0.25 }, direction: 'random', cooldown: 90 },
  calm_before_storm: { duration: { min: 30, max: 60 }, magnitude: { min: 0.15, max: 0.35 }, direction: 'random', cooldown: 60 },
  volatility_storm: { duration: { min: 45, max: 120 }, magnitude: { min: 2.0, max: 3.0 }, direction: 'none', cooldown: 60 },
  price_freeze: { duration: { min: 10, max: 30 }, magnitude: { min: 0, max: 0 }, direction: 'none', cooldown: 90 },
  momentum_flip: { duration: { min: 5, max: 10 }, magnitude: { min: 0, max: 0 }, direction: 'none', cooldown: 60 },
  mystery_whale: { duration: { min: 30, max: 90 }, magnitude: { min: 0.15, max: 0.50 }, direction: 'random', cooldown: 60 },
  double_or_nothing: { duration: { min: 5, max: 10 }, magnitude: { min: 0.50, max: 0.50 }, direction: 'random', cooldown: 120 },
  golden_hour: { duration: { min: 60, max: 180 }, magnitude: { min: 0.80, max: 1.20 }, direction: 'up', cooldown: 180 },
};

// Event probabilities per second, modified by phase
function calculateEventProbs(phase: MarketPhase, momentum: number): { pump: number; crash: number; chaos: number } {
  const base = { pump: 0.002, crash: 0.002, chaos: 0.001 };
  
  const mods: Record<MarketPhase, { pump: number; crash: number; chaos: number }> = {
    accumulation: { pump: 1.5, crash: 0.3, chaos: 1.2 },
    markup: { pump: 2.0, crash: 0.5, chaos: 1.0 },
    euphoria: { pump: 0.5, crash: 3.0, chaos: 2.0 },
    distribution: { pump: 0.5, crash: 2.0, chaos: 1.5 },
    decline: { pump: 0.5, crash: 1.5, chaos: 1.5 },
    capitulation: { pump: 2.5, crash: 0.3, chaos: 2.0 },
    recovery: { pump: 1.5, crash: 0.5, chaos: 1.0 },
  };
  
  const mod = mods[phase];
  const momentumMod = 1 + momentum * 0.3;
  
  return {
    pump: base.pump * mod.pump * (momentum > 0 ? momentumMod : 1),
    crash: base.crash * mod.crash * (momentum < 0 ? (2 - momentumMod) : 1),
    chaos: base.chaos * mod.chaos,
  };
}

// ============================================
// VOLATILITY CONFIG
// ============================================

const VOLATILITY_BY_PHASE: Record<MarketPhase, { base: number; max: number }> = {
  accumulation: { base: 0.0006, max: 0.006 },  // very calm
  markup:       { base: 0.0012, max: 0.012 },  // building
  euphoria:     { base: 0.0020, max: 0.020 },  // exciting but controlled
  distribution: { base: 0.0025, max: 0.025 },  // choppy
  decline:      { base: 0.0020, max: 0.020 },  // steady bleed
  capitulation: { base: 0.0035, max: 0.035 },  // painful but not catastrophic
  recovery:     { base: 0.0010, max: 0.010 },  // slow rebuild
};

function getVolatilityName(base: number): string {
  if (base < 0.001) return 'calme';
  if (base < 0.002) return 'normal';
  if (base < 0.003) return 'volatile';
  if (base < 0.004) return 'agité';
  return 'chaotique';
}

// ============================================
// HELPERS
// ============================================

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickPhase(probs: Record<MarketPhase, number>): MarketPhase {
  const roll = Math.random();
  let cumulative = 0;
  for (const [phase, prob] of Object.entries(probs)) {
    cumulative += prob;
    if (roll <= cumulative) {
      return phase as MarketPhase;
    }
  }
  return 'accumulation';
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
      phaseDuration: randomInRange(PHASE_DURATIONS.accumulation.min, PHASE_DURATIONS.accumulation.max) * 1000,
      momentum: 0,
      activeEvent: 'none',
      eventStartTime: 0,
      eventDuration: 0,
      eventDirection: 0,
      nextEventIn: randomInRange(EVENT_CHECK_INTERVAL.min, EVENT_CHECK_INTERVAL.max) * 1000,
      allTimeHigh: DC_INITIAL_PRICE,
      allTimeLow: DC_INITIAL_PRICE,
      lastUpdate: now,
      recentPumps: 0,
      recentCrashes: 0,
      lastRegulationCheck: now,
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

  const parsed = JSON.parse(config[0].value) as MarketState;
  
  // Validate and fix corrupted state
  const now = Date.now();
  if (!parsed.phaseDuration || parsed.phaseDuration <= 0 || isNaN(parsed.phaseDuration)) {
    const dur = PHASE_DURATIONS[parsed.phase] || PHASE_DURATIONS.accumulation;
    parsed.phaseDuration = randomInRange(dur.min, dur.max) * 1000;
    parsed.phaseStartTime = now;
  }
  if (!parsed.phaseStartTime || isNaN(parsed.phaseStartTime)) {
    parsed.phaseStartTime = now;
  }
  if (!parsed.nextEventIn || isNaN(parsed.nextEventIn)) {
    parsed.nextEventIn = randomInRange(EVENT_CHECK_INTERVAL.min, EVENT_CHECK_INTERVAL.max) * 1000;
  }
  if (!parsed.momentum || isNaN(parsed.momentum)) {
    parsed.momentum = 0;
  }
  // Regulation counters - init if missing (migration)
  if (parsed.recentPumps === undefined || isNaN(parsed.recentPumps)) {
    parsed.recentPumps = 0;
  }
  if (parsed.recentCrashes === undefined || isNaN(parsed.recentCrashes)) {
    parsed.recentCrashes = 0;
  }
  if (!parsed.lastRegulationCheck || isNaN(parsed.lastRegulationCheck)) {
    parsed.lastRegulationCheck = now;
  }
  
  return parsed;
}

async function saveMarketState(state: MarketState): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "GameConfig"
    SET value = ${JSON.stringify(state)}::jsonb, "updatedAt" = NOW()
    WHERE key = 'dahkacoin_market'
  `;
}

// ============================================
// PRICE TICK
// ============================================

export async function tickPrice(): Promise<{
  price: number;
  phase: MarketPhase;
  phaseProgress: number;
  phaseTimeLeft: number;
  momentum: number;
  volatility: string;
  activeEvent: MarketEvent;
  eventProgress: number;
  eventTimeLeft: number;
  nextEventIn: number;
  nextPhaseProbs: Record<MarketPhase, number>;
  eventProbs: { pump: number; crash: number; chaos: number };
  allTimeHigh: number;
  allTimeLow: number;
}> {
  const state = await getMarketState();
  const now = Date.now();
  const deltaMs = Math.min(10000, now - state.lastUpdate);
  const deltaSeconds = deltaMs / 1000;
  
  if (deltaSeconds < 0.5) {
    const phaseElapsed = now - state.phaseStartTime;
    const phaseProgress = Math.min(1, phaseElapsed / state.phaseDuration);
    const phaseTimeLeft = Math.max(0, (state.phaseDuration - phaseElapsed) / 1000);
    
    let eventProgress = 0;
    let eventTimeLeft = 0;
    if (state.activeEvent !== 'none') {
      const eventElapsed = now - state.eventStartTime;
      eventProgress = Math.min(1, eventElapsed / state.eventDuration);
      eventTimeLeft = Math.max(0, (state.eventDuration - eventElapsed) / 1000);
    }
    
    return {
      price: state.price,
      phase: state.phase,
      phaseProgress,
      phaseTimeLeft,
      momentum: state.momentum,
      volatility: getVolatilityName(VOLATILITY_BY_PHASE[state.phase].base),
      activeEvent: state.activeEvent,
      eventProgress,
      eventTimeLeft,
      nextEventIn: Math.max(0, state.nextEventIn / 1000),
      nextPhaseProbs: calculatePhaseTransitions(state.phase, state.momentum, state.price),
      eventProbs: calculateEventProbs(state.phase, state.momentum),
      allTimeHigh: state.allTimeHigh,
      allTimeLow: state.allTimeLow,
    };
  }

  // Update phase
  const phaseElapsed = now - state.phaseStartTime;
  if (phaseElapsed >= state.phaseDuration) {
    const probs = calculatePhaseTransitions(state.phase, state.momentum, state.price);
    state.phase = pickPhase(probs);
    state.phaseStartTime = now;
    // Use phase-specific duration
    const newPhaseDur = PHASE_DURATIONS[state.phase];
    state.phaseDuration = randomInRange(newPhaseDur.min, newPhaseDur.max) * 1000;
    
    // Phase change affects momentum
    if (state.phase === 'euphoria' || state.phase === 'markup') {
      state.momentum = Math.min(1, state.momentum + 0.15);
    } else if (state.phase === 'capitulation' || state.phase === 'decline') {
      state.momentum = Math.max(-1, state.momentum - 0.15);
    }
  }

  // Update event countdown and check for new events
  state.nextEventIn -= deltaMs;
  
  // Decay regulation counters every 5 minutes
  if (now - state.lastRegulationCheck > 300000) {
    state.recentPumps = Math.max(0, state.recentPumps - 1);
    state.recentCrashes = Math.max(0, state.recentCrashes - 1);
    state.lastRegulationCheck = now;
  }
  
  if (state.activeEvent !== 'none') {
    const eventElapsed = now - state.eventStartTime;
    if (eventElapsed >= state.eventDuration) {
      state.activeEvent = 'none';
      state.eventDuration = 0;
      state.nextEventIn = randomInRange(EVENT_CHECK_INTERVAL.min, EVENT_CHECK_INTERVAL.max) * 1000;
    }
  } else if (state.nextEventIn <= 0) {
    let event: MarketEvent = 'none';
    
    // REGULATION: Force correction based on price deviation from fair value (3€)
    const pumpImbalance = state.recentPumps - state.recentCrashes;
    const priceVsFair = state.price / DC_FAIR_VALUE;
    
    // Price thresholds: fair=3€
    // >10.5€ (3.5x) = whale_dump, >15€ (5x) = flash_crash, >21€ (7x) = rug_pull
    // <1.5€ (0.5x) = whale_pump, <1€ (0.33x) = short_squeeze, <0.6€ (0.2x) = mega_pump
    
    if (priceVsFair > 3.5 || pumpImbalance >= 2) {  // >10.5€ or 2+ pump imbalance
      if (priceVsFair > 7 || pumpImbalance >= 4) {
        event = 'rug_pull';        // >21€
      } else if (priceVsFair > 5 || pumpImbalance >= 3) {
        event = 'flash_crash';     // >15€
      } else {
        event = 'whale_dump';      // >10.5€
      }
      state.recentPumps = 0;
    }
    else if (priceVsFair < 0.5 || pumpImbalance <= -2) {  // <1.5€ or 2+ crash imbalance
      if (priceVsFair < 0.2 || pumpImbalance <= -4) {
        event = 'mega_pump';       // <0.6€ emergency
      } else if (priceVsFair < 0.33 || pumpImbalance <= -3) {
        event = 'short_squeeze';   // <1€
      } else {
        event = 'whale_pump';      // <1.5€
      }
      state.recentCrashes = 0;
    }
    // Normal random event selection
    else {
      const probs = calculateEventProbs(state.phase, state.momentum);
      const totalProb = probs.pump + probs.crash + probs.chaos;
      
      if (Math.random() < totalProb * 10) {
        const roll = Math.random();
        
        if (roll < probs.pump / totalProb) {
          const pumpEvents: MarketEvent[] = ['whale_pump', 'mega_pump', 'fomo_wave', 'short_squeeze', 'golden_hour'];
          event = pumpEvents[Math.floor(Math.random() * pumpEvents.length)];
        } else if (roll < (probs.pump + probs.crash) / totalProb) {
          const crashEvents: MarketEvent[] = ['whale_dump', 'flash_crash', 'panic_wave', 'rug_pull'];
          const available = state.phase === 'euphoria' ? crashEvents : crashEvents.filter(e => e !== 'rug_pull');
          event = available[Math.floor(Math.random() * available.length)];
        } else {
          const chaosEvents: MarketEvent[] = ['dead_cat_bounce', 'calm_before_storm', 'volatility_storm', 'price_freeze', 'momentum_flip', 'mystery_whale', 'double_or_nothing'];
          event = chaosEvents[Math.floor(Math.random() * chaosEvents.length)];
        }
      }
    }
    
    if (event !== 'none') {
      const config = EVENT_CONFIG[event];
      state.activeEvent = event;
      state.eventStartTime = now;
      state.eventDuration = randomInRange(config.duration.min, config.duration.max) * 1000;
      state.eventDirection = config.direction === 'random' ? (Math.random() > 0.5 ? 1 : -1) : (config.direction === 'up' ? 1 : config.direction === 'down' ? -1 : 0);
      
      // Track event type for regulation
      const pumpEvents: MarketEvent[] = ['whale_pump', 'mega_pump', 'fomo_wave', 'short_squeeze', 'golden_hour'];
      const crashEvents: MarketEvent[] = ['whale_dump', 'flash_crash', 'panic_wave', 'rug_pull'];
      
      if (pumpEvents.includes(event)) {
        state.recentPumps++;
      } else if (crashEvents.includes(event)) {
        state.recentCrashes++;
      }
      
      // Special: momentum_flip
      if (event === 'momentum_flip') {
        state.momentum = -state.momentum;
      }
    }
    
    state.nextEventIn = randomInRange(EVENT_CHECK_INTERVAL.min, EVENT_CHECK_INTERVAL.max) * 1000;
  }

  // Update momentum with faster decay - prevents runaway spirals
  state.momentum *= 0.985;  // Momentum halves every ~46 ticks
  
  // Phase influences momentum - reduced to prevent extreme swings
  const phaseInfluence: Record<MarketPhase, number> = {
    accumulation:  0.001,   // very slight bullish
    markup:        0.003,   // moderate bullish
    euphoria:     -0.002,   // mild profit taking
    distribution: -0.004,   // moderate selling
    decline:      -0.005,   // steady decline
    capitulation: -0.006,   // painful but recoverable
    recovery:      0.002,   // slow rebuild
  };
  state.momentum += phaseInfluence[state.phase] * deltaSeconds;
  
  // Add random momentum fluctuation for more dynamic probs
  state.momentum += (Math.random() - 0.5) * 0.01 * deltaSeconds;
  state.momentum = Math.max(-1, Math.min(1, state.momentum));

  // Calculate price change
  const volatility = VOLATILITY_BY_PHASE[state.phase];
  let volatilityMod = 1.0;
  
  if (state.activeEvent === 'volatility_storm') {
    volatilityMod = randomInRange(3, 5);
  } else if (state.activeEvent === 'price_freeze') {
    volatilityMod = 0;
  } else if (state.activeEvent === 'calm_before_storm') {
    const progress = (now - state.eventStartTime) / state.eventDuration;
    volatilityMod = progress > 0.9 ? 5 : 0.1;
  }

  let priceChange = 0;
  
  if (volatilityMod > 0) {
    // Base random walk
    priceChange += (Math.random() - 0.5) * 2 * volatility.base * volatilityMod * Math.sqrt(deltaSeconds);
    
    // Momentum
    priceChange += state.momentum * volatility.base * 2 * deltaSeconds;
    
    // Event impact
    if (state.activeEvent !== 'none' && state.activeEvent !== 'price_freeze' && state.activeEvent !== 'volatility_storm' && state.activeEvent !== 'momentum_flip') {
      const config = EVENT_CONFIG[state.activeEvent];
      const magnitude = randomInRange(config.magnitude.min, config.magnitude.max);
      const progress = (now - state.eventStartTime) / state.eventDuration;
      const intensity = Math.sin(progress * Math.PI);
      
      let direction = state.eventDirection;
      
      // Dead cat bounce reverses at 60%
      if (state.activeEvent === 'dead_cat_bounce' && progress > 0.6) {
        direction = -1.5;
      }
      
      // Double or nothing: instant at peak
      if (state.activeEvent === 'double_or_nothing' && progress > 0.5 && progress < 0.6) {
        priceChange = direction > 0 ? 1.0 : -0.5;
      } else if (state.activeEvent !== 'double_or_nothing') {
        priceChange += (magnitude / (state.eventDuration / 1000)) * intensity * direction * deltaSeconds;
      }
    }
    
    // CONTINUOUS MEAN REVERSION - always pulls toward fair value (3€)
    // Creates a "gravity well" - the further from fair, the stronger the pull
    const priceRatio = state.price / DC_FAIR_VALUE;
    const deviationFromFair = Math.log(priceRatio); // log scale for symmetry
    const reversionStrength = 0.0005;
    priceChange += -deviationFromFair * reversionStrength * deltaSeconds;
    
    // Random spike (5% chance)
    if (Math.random() < 0.05) {
      priceChange += (Math.random() - 0.5) * volatility.max * volatilityMod;
    }
  }

  // Apply price change
  let newPrice = state.price * (1 + priceChange);
  newPrice = Math.max(DC_MIN_PRICE, Math.min(DC_MAX_PRICE, newPrice));
  newPrice = Math.round(newPrice * 10000) / 10000;
  
  state.allTimeHigh = Math.max(state.allTimeHigh, newPrice);
  state.allTimeLow = Math.min(state.allTimeLow, newPrice);
  state.price = newPrice;
  state.lastUpdate = now;

  await saveMarketState(state);

  // Save price point
  if (deltaSeconds >= 5) {
    await prisma.$executeRaw`
      INSERT INTO "DahkaCoinPrice" (id, price, trend, "createdAt")
      VALUES (gen_random_uuid()::text, ${newPrice}, ${Math.round(state.momentum * 10)}, NOW())
    `;
  }

  const newPhaseElapsed = now - state.phaseStartTime;
  const phaseProgress = Math.min(1, newPhaseElapsed / state.phaseDuration);
  const phaseTimeLeft = Math.max(0, (state.phaseDuration - newPhaseElapsed) / 1000);
  
  let eventProgress = 0;
  let eventTimeLeft = 0;
  if (state.activeEvent !== 'none') {
    const eventElapsed = now - state.eventStartTime;
    eventProgress = Math.min(1, eventElapsed / state.eventDuration);
    eventTimeLeft = Math.max(0, (state.eventDuration - eventElapsed) / 1000);
  }

  return {
    price: newPrice,
    phase: state.phase,
    phaseProgress,
    phaseTimeLeft,
    momentum: state.momentum,
    volatility: getVolatilityName(VOLATILITY_BY_PHASE[state.phase].base),
    activeEvent: state.activeEvent,
    eventProgress,
    eventTimeLeft,
    nextEventIn: Math.max(0, state.nextEventIn / 1000),
    nextPhaseProbs: calculatePhaseTransitions(state.phase, state.momentum, state.price),
    eventProbs: calculateEventProbs(state.phase, state.momentum),
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
  const state = await getMarketState();
  const now = Date.now();

  const periodMs = period === "1h" ? 3600000 : period === "24h" ? 86400000 : 604800000;
  
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

  const phaseElapsed = now - state.phaseStartTime;
  const phaseProgress = state.phaseDuration > 0 ? Math.min(1, phaseElapsed / state.phaseDuration) : 0;
  const phaseTimeLeft = Math.max(0, (state.phaseDuration - phaseElapsed) / 1000);

  let eventProgress = 0;
  let eventTimeLeft = 0;
  if (state.activeEvent !== 'none' && state.eventDuration > 0) {
    const eventElapsed = now - state.eventStartTime;
    eventProgress = Math.min(1, eventElapsed / state.eventDuration);
    eventTimeLeft = Math.max(0, (state.eventDuration - eventElapsed) / 1000);
  }

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
        userProfit = (state.price - userAvgPrice) * userDC;
      }
    }
  }

  return {
    currentPrice: state.price,
    phase: state.phase,
    phaseProgress,
    phaseTimeLeft,
    momentum: state.momentum,
    volatility: getVolatilityName(VOLATILITY_BY_PHASE[state.phase].base),
    activeEvent: state.activeEvent,
    eventProgress,
    eventTimeLeft,
    nextEventIn: Math.max(0, state.nextEventIn / 1000),
    nextPhaseProbs: calculatePhaseTransitions(state.phase, state.momentum, state.price),
    eventProbs: calculateEventProbs(state.phase, state.momentum),
    allTimeHigh: state.allTimeHigh,
    allTimeLow: state.allTimeLow,
    priceHistory,
    userDC,
    userAvgPrice,
    userProfit,
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

// Admin: Reset market state (for debugging)
export async function resetMarketState(): Promise<{ success: boolean }> {
  const now = Date.now();
  const freshState: MarketState = {
    price: DC_INITIAL_PRICE,
    phase: 'accumulation',
    phaseStartTime: now,
    phaseDuration: randomInRange(PHASE_DURATIONS.accumulation.min, PHASE_DURATIONS.accumulation.max) * 1000,
    momentum: 0,
    activeEvent: 'none',
    eventStartTime: 0,
    eventDuration: 0,
    eventDirection: 0,
    nextEventIn: randomInRange(EVENT_CHECK_INTERVAL.min, EVENT_CHECK_INTERVAL.max) * 1000,
    allTimeHigh: DC_INITIAL_PRICE,
    allTimeLow: DC_INITIAL_PRICE,
    lastUpdate: now,
    recentPumps: 0,
    recentCrashes: 0,
    lastRegulationCheck: now,
  };
  
  await prisma.$executeRaw`
    UPDATE "GameConfig"
    SET value = ${JSON.stringify(freshState)}::jsonb, "updatedAt" = NOW()
    WHERE key = 'dahkacoin_market'
  `;
  
  return { success: true };
}
