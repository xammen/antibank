"use server";

import { prisma } from "@antibank/db";
import { auth } from "@/lib/auth";

// ============================================
// CONFIGURATION
// ============================================

const DC_MIN_PRICE = 0.10;
const DC_MAX_PRICE = 50.00;
const DC_INITIAL_PRICE = 1.00;
const DC_SELL_FEE = 0.02;

// ============================================
// TYPES
// ============================================

interface PricePoint {
  price: number;
  createdAt: Date;
}

interface MarketState {
  price: number;
  trend: number;           // -1 to 1 (bearish to bullish)
  volatility: number;      // 0.5 to 2 (low to high volatility)
  momentum: number;        // -0.5 to 0.5 (acceleration)
  trendDuration: number;   // seconds remaining in current trend
  lastUpdate: number;      // timestamp
}

interface DCState {
  currentPrice: number;
  trend: number;
  volatility: number;
  momentum: number;
  trendDuration: number;
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
// MARKET STATE MANAGEMENT
// ============================================

/**
 * Get or initialize market state from GameConfig
 */
async function getMarketState(): Promise<MarketState> {
  const config = await prisma.$queryRaw<{ value: string }[]>`
    SELECT value::text FROM "GameConfig" WHERE key = 'dahkacoin_market'
  `;

  if (config.length === 0) {
    // Initialize market state
    const initialState: MarketState = {
      price: DC_INITIAL_PRICE,
      trend: 0,
      volatility: 1,
      momentum: 0,
      trendDuration: 60 + Math.floor(Math.random() * 180), // 1-4 minutes
      lastUpdate: Date.now(),
    };
    
    await prisma.$executeRaw`
      INSERT INTO "GameConfig" (key, value, "updatedAt")
      VALUES ('dahkacoin_market', ${JSON.stringify(initialState)}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(initialState)}::jsonb, "updatedAt" = NOW()
    `;

    // Also insert initial price point
    await prisma.$executeRaw`
      INSERT INTO "DahkaCoinPrice" (id, price, trend, "createdAt")
      VALUES (gen_random_uuid()::text, ${DC_INITIAL_PRICE}, 0, NOW())
    `;

    return initialState;
  }

  return JSON.parse(config[0].value) as MarketState;
}

/**
 * Save market state
 */
async function saveMarketState(state: MarketState): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "GameConfig"
    SET value = ${JSON.stringify(state)}::jsonb, "updatedAt" = NOW()
    WHERE key = 'dahkacoin_market'
  `;
}

/**
 * Generate new trend parameters
 */
function generateNewTrend(currentPrice: number): { trend: number; volatility: number; momentum: number; duration: number } {
  // Bias trend towards mean reversion when price is extreme
  let trendBias = 0;
  if (currentPrice < 0.5) trendBias = 0.3;  // More likely to go up when low
  if (currentPrice > 10) trendBias = -0.3;  // More likely to go down when high
  
  const trend = Math.max(-1, Math.min(1, (Math.random() - 0.5) * 2 + trendBias));
  const volatility = 0.5 + Math.random() * 1.5; // 0.5 to 2
  const momentum = (Math.random() - 0.5) * 0.5; // -0.25 to 0.25
  const duration = 60 + Math.floor(Math.random() * 240); // 1-5 minutes
  
  return { trend, volatility, momentum, duration };
}

/**
 * Calculate price change for a given time delta
 * This creates realistic micro-fluctuations
 */
function calculatePriceChange(state: MarketState, deltaSeconds: number): number {
  // Base movement from trend (stronger trends = more directional movement)
  const trendEffect = state.trend * 0.001 * deltaSeconds;
  
  // Random walk component (scaled by volatility)
  const noise = (Math.random() - 0.5) * 0.002 * state.volatility * Math.sqrt(deltaSeconds);
  
  // Momentum effect (accelerating/decelerating)
  const momentumEffect = state.momentum * 0.0005 * deltaSeconds;
  
  // Combine effects
  const totalChange = trendEffect + noise + momentumEffect;
  
  return totalChange;
}

// ============================================
// PRICE UPDATES (Called by server/cron)
// ============================================

/**
 * Update price - should be called every second by the client or a cron job
 * Returns the new price and updated market state
 */
export async function tickPrice(): Promise<{ 
  price: number; 
  trend: number; 
  volatility: number;
  momentum: number;
  trendDuration: number;
  event?: string 
}> {
  const state = await getMarketState();
  const now = Date.now();
  const deltaSeconds = Math.min(10, (now - state.lastUpdate) / 1000); // Cap at 10s to prevent huge jumps
  
  if (deltaSeconds < 0.5) {
    // Too soon, return current state
    return {
      price: state.price,
      trend: state.trend,
      volatility: state.volatility,
      momentum: state.momentum,
      trendDuration: state.trendDuration,
    };
  }

  let newPrice = state.price;
  let newTrend = state.trend;
  let newVolatility = state.volatility;
  let newMomentum = state.momentum;
  let newTrendDuration = state.trendDuration - deltaSeconds;
  let event: string | undefined;

  // Check for rare events (0.1% chance per tick)
  const eventRoll = Math.random();
  if (eventRoll < 0.001) {
    // Crash! -15% to -40%
    const crashPercent = 0.15 + Math.random() * 0.25;
    newPrice = state.price * (1 - crashPercent);
    event = "krach";
    newTrend = -0.8 - Math.random() * 0.2;
    newVolatility = 1.5 + Math.random() * 0.5;
    newTrendDuration = 30 + Math.floor(Math.random() * 60);
  } else if (eventRoll < 0.002) {
    // Pump! +20% to +50%
    const pumpPercent = 0.20 + Math.random() * 0.30;
    newPrice = state.price * (1 + pumpPercent);
    event = "pump";
    newTrend = 0.8 + Math.random() * 0.2;
    newVolatility = 1.5 + Math.random() * 0.5;
    newTrendDuration = 30 + Math.floor(Math.random() * 60);
  } else {
    // Normal price movement
    const priceChange = calculatePriceChange(state, deltaSeconds);
    newPrice = state.price * (1 + priceChange);
    
    // Check if we need a new trend
    if (newTrendDuration <= 0) {
      const newTrendParams = generateNewTrend(newPrice);
      newTrend = newTrendParams.trend;
      newVolatility = newTrendParams.volatility;
      newMomentum = newTrendParams.momentum;
      newTrendDuration = newTrendParams.duration;
    }
  }

  // Clamp price
  newPrice = Math.max(DC_MIN_PRICE, Math.min(DC_MAX_PRICE, newPrice));
  newPrice = Math.round(newPrice * 10000) / 10000;

  // Update state
  const newState: MarketState = {
    price: newPrice,
    trend: newTrend,
    volatility: newVolatility,
    momentum: newMomentum,
    trendDuration: newTrendDuration,
    lastUpdate: now,
  };
  
  await saveMarketState(newState);

  // Save price point (every ~5 seconds to avoid DB bloat)
  if (deltaSeconds >= 5) {
    await prisma.$executeRaw`
      INSERT INTO "DahkaCoinPrice" (id, price, trend, "createdAt")
      VALUES (gen_random_uuid()::text, ${newPrice}, ${Math.round(newTrend * 10)}, NOW())
    `;
  }

  return {
    price: newPrice,
    trend: newTrend,
    volatility: newVolatility,
    momentum: newMomentum,
    trendDuration: newTrendDuration,
    event,
  };
}

/**
 * Get current price without updating (for read-only operations)
 */
export async function getCurrentPrice(): Promise<{ price: number; trend: number }> {
  const state = await getMarketState();
  return { price: state.price, trend: Math.round(state.trend * 2) }; // Convert to -2 to 2 scale
}

// ============================================
// TRADING
// ============================================

export async function buyDahkaCoin(euroAmount: number): Promise<TradeResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté" };
  }

  if (euroAmount <= 0 || euroAmount < 0.10) {
    return { success: false, error: "minimum 0.10€" };
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
      VALUES (gen_random_uuid()::text, ${userId}, 'dc_buy', ${-euroAmount}, ${'achat ' + dcAmount.toFixed(4) + ' DC @ ' + price.toFixed(4) + '€'}, NOW())
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
    return { success: false, error: "non connecté" };
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
      VALUES (gen_random_uuid()::text, ${userId}, 'dc_sell', ${netEuros}, ${'vente ' + dcAmount.toFixed(4) + ' DC @ ' + price.toFixed(4) + '€ (frais: ' + fee.toFixed(2) + '€)'}, NOW())
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

  const history = await prisma.$queryRaw<{ price: string; createdAt: Date }[]>`
    SELECT price::text, "createdAt"
    FROM "DahkaCoinPrice"
    WHERE "createdAt" > NOW() - INTERVAL '7 days'
    ORDER BY "createdAt" ASC
  `;

  const now = new Date();
  const periodMs = period === "1h" ? 3600000 : period === "24h" ? 86400000 : 604800000;
  const filteredHistory = history.filter(h => now.getTime() - new Date(h.createdAt).getTime() < periodMs);

  const priceHistory = filteredHistory.map(h => ({
    price: parseFloat(h.price),
    createdAt: h.createdAt,
  }));

  const lastUpdate = history.length > 0 ? history[history.length - 1].createdAt : null;

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

  return {
    currentPrice: marketState.price,
    trend: marketState.trend,
    volatility: marketState.volatility,
    momentum: marketState.momentum,
    trendDuration: marketState.trendDuration,
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
