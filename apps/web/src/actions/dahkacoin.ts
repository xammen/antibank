"use server";

import { prisma } from "@antibank/db";
import { auth } from "@/lib/auth";

// ============================================
// CONFIGURATION
// ============================================

const DC_MIN_PRICE = 0.10;    // Prix minimum
const DC_MAX_PRICE = 50.00;   // Prix maximum
const DC_INITIAL_PRICE = 1.00; // Prix initial
const DC_SELL_FEE = 0.02;     // 2% de frais sur les ventes
const DC_UPDATE_INTERVAL = 30; // Mise à jour toutes les 30 secondes

// ============================================
// TYPES
// ============================================

interface PricePoint {
  price: number;
  createdAt: Date;
}

interface DCState {
  currentPrice: number;
  trend: number;
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
// PRICE MANAGEMENT
// ============================================

/**
 * Récupère le prix actuel du DahkaCoin
 * Si aucun prix n'existe, initialise à 1.00€
 */
export async function getCurrentPrice(): Promise<{ price: number; trend: number }> {
  const latest = await prisma.$queryRaw<{ price: string; trend: number }[]>`
    SELECT price::text, trend 
    FROM "DahkaCoinPrice" 
    ORDER BY "createdAt" DESC 
    LIMIT 1
  `;

  if (latest.length === 0) {
    // Initialiser le prix si aucun n'existe
    await prisma.$executeRaw`
      INSERT INTO "DahkaCoinPrice" (id, price, trend, "createdAt")
      VALUES (gen_random_uuid()::text, ${DC_INITIAL_PRICE}, 0, NOW())
    `;
    return { price: DC_INITIAL_PRICE, trend: 0 };
  }

  return { 
    price: parseFloat(latest[0].price), 
    trend: latest[0].trend 
  };
}

/**
 * Met à jour le prix du DahkaCoin (appelé automatiquement)
 * Variation: -5% à +5% + tendance (-2% à +2%)
 * 5% de chance d'event (crash -30% à -60% ou pump +30% à +80%)
 */
export async function updatePrice(): Promise<{ price: number; trend: number; event?: string }> {
  const { price: currentPrice, trend: currentTrend } = await getCurrentPrice();
  
  let newPrice = currentPrice;
  let newTrend = currentTrend;
  let event: string | undefined;

  // 5% de chance d'event rare
  const eventRoll = Math.random();
  if (eventRoll < 0.025) {
    // Crash! -30% à -60%
    const crashPercent = 0.30 + Math.random() * 0.30;
    newPrice = currentPrice * (1 - crashPercent);
    event = `krach`;
    newTrend = -2;
  } else if (eventRoll < 0.05) {
    // Pump! +30% à +80%
    const pumpPercent = 0.30 + Math.random() * 0.50;
    newPrice = currentPrice * (1 + pumpPercent);
    event = `pump`;
    newTrend = 2;
  } else {
    // Variation normale: -5% à +5%
    const baseVariation = (Math.random() - 0.5) * 0.10; // -5% à +5%
    
    // Ajouter la tendance: -2% à +2%
    const trendEffect = currentTrend * 0.01;
    
    newPrice = currentPrice * (1 + baseVariation + trendEffect);
    
    // Mettre à jour la tendance (elle peut changer)
    // 10% de chance de changer de tendance
    if (Math.random() < 0.10) {
      newTrend = Math.floor(Math.random() * 5) - 2; // -2 à +2
    }
  }

  // Limiter le prix
  newPrice = Math.max(DC_MIN_PRICE, Math.min(DC_MAX_PRICE, newPrice));
  
  // Arrondir à 4 décimales
  newPrice = Math.round(newPrice * 10000) / 10000;

  // Sauvegarder le nouveau prix
  await prisma.$executeRaw`
    INSERT INTO "DahkaCoinPrice" (id, price, trend, "createdAt")
    VALUES (gen_random_uuid()::text, ${newPrice}, ${newTrend}, NOW())
  `;

  return { price: newPrice, trend: newTrend, event };
}

/**
 * Récupère l'historique des prix
 * @param period "1h" | "24h" | "7d"
 */
export async function getPriceHistory(period: "1h" | "24h" | "7d"): Promise<PricePoint[]> {
  let interval: string;
  switch (period) {
    case "1h":
      interval = "1 hour";
      break;
    case "24h":
      interval = "24 hours";
      break;
    case "7d":
      interval = "7 days";
      break;
  }

  const history = await prisma.$queryRaw<{ price: string; createdAt: Date }[]>`
    SELECT price::text, "createdAt"
    FROM "DahkaCoinPrice"
    WHERE "createdAt" > NOW() - INTERVAL '${interval}'
    ORDER BY "createdAt" ASC
  `;

  // Fix: parameterized interval doesn't work well, use raw
  const historyFixed = await prisma.$queryRaw<{ price: string; createdAt: Date }[]>`
    SELECT price::text, "createdAt"
    FROM "DahkaCoinPrice"
    WHERE "createdAt" > NOW() - ${period === "1h" ? "INTERVAL '1 hour'" : period === "24h" ? "INTERVAL '24 hours'" : "INTERVAL '7 days'"}::interval
    ORDER BY "createdAt" ASC
  `;

  return history.map(h => ({
    price: parseFloat(h.price),
    createdAt: h.createdAt
  }));
}

// ============================================
// TRADING
// ============================================

/**
 * Acheter du DahkaCoin avec des euros
 */
export async function buyDahkaCoin(euroAmount: number): Promise<TradeResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté" };
  }

  if (euroAmount <= 0) {
    return { success: false, error: "montant invalide" };
  }

  if (euroAmount < 0.10) {
    return { success: false, error: "minimum 0.10€" };
  }

  const userId = session.user.id;

  // Récupérer la balance et le prix actuel
  const userData = await prisma.$queryRaw<{ balance: string; dahkaCoins: string; dcAvgBuyPrice: string | null }[]>`
    SELECT balance::text, "dahkaCoins"::text, "dcAvgBuyPrice"::text
    FROM "User"
    WHERE id = ${userId}
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

  // Calculer le nouveau prix moyen d'achat
  let newAvgPrice: number;
  if (currentAvgPrice === null || currentDC === 0) {
    newAvgPrice = price;
  } else {
    // Moyenne pondérée
    const totalValue = (currentDC * currentAvgPrice) + euroAmount;
    const totalDC = currentDC + dcAmount;
    newAvgPrice = totalValue / totalDC;
  }

  // Transaction atomique
  await prisma.$transaction(async (tx) => {
    // Déduire les euros et ajouter les DC
    await tx.$executeRaw`
      UPDATE "User"
      SET 
        balance = balance - ${euroAmount},
        "dahkaCoins" = "dahkaCoins" + ${dcAmount},
        "dcAvgBuyPrice" = ${newAvgPrice},
        "updatedAt" = NOW()
      WHERE id = ${userId}
    `;

    // Log la transaction
    await tx.$executeRaw`
      INSERT INTO "DahkaCoinTx" (id, "userId", type, "dcAmount", "euroAmount", price, "createdAt")
      VALUES (gen_random_uuid()::text, ${userId}, 'buy', ${dcAmount}, ${euroAmount}, ${price}, NOW())
    `;

    // Transaction générale
    await tx.$executeRaw`
      INSERT INTO "Transaction" (id, "userId", type, amount, description, "createdAt")
      VALUES (gen_random_uuid()::text, ${userId}, 'dc_buy', ${-euroAmount}, ${'achat ' + dcAmount.toFixed(4) + ' DC @ ' + price.toFixed(4) + '€'}, NOW())
    `;
  });

  return {
    success: true,
    dcAmount: dcAmount,
    euroAmount: euroAmount,
    newBalance: balance - euroAmount,
    newDCBalance: currentDC + dcAmount
  };
}

/**
 * Vendre du DahkaCoin pour des euros (2% de frais)
 */
export async function sellDahkaCoin(dcAmount: number): Promise<TradeResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté" };
  }

  if (dcAmount <= 0) {
    return { success: false, error: "montant invalide" };
  }

  const userId = session.user.id;

  // Récupérer la balance DC
  const userData = await prisma.$queryRaw<{ balance: string; dahkaCoins: string; dcAvgBuyPrice: string | null }[]>`
    SELECT balance::text, "dahkaCoins"::text, "dcAvgBuyPrice"::text
    FROM "User"
    WHERE id = ${userId}
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

  // Transaction atomique
  await prisma.$transaction(async (tx) => {
    // Déduire les DC et ajouter les euros
    await tx.$executeRaw`
      UPDATE "User"
      SET 
        balance = balance + ${netEuros},
        "dahkaCoins" = "dahkaCoins" - ${dcAmount},
        "updatedAt" = NOW()
      WHERE id = ${userId}
    `;

    // Si plus de DC, reset le prix moyen
    const remainingDC = currentDC - dcAmount;
    if (remainingDC <= 0.0001) {
      await tx.$executeRaw`
        UPDATE "User"
        SET "dcAvgBuyPrice" = NULL
        WHERE id = ${userId}
      `;
    }

    // Log la transaction DC
    await tx.$executeRaw`
      INSERT INTO "DahkaCoinTx" (id, "userId", type, "dcAmount", "euroAmount", price, "createdAt")
      VALUES (gen_random_uuid()::text, ${userId}, 'sell', ${dcAmount}, ${netEuros}, ${price}, NOW())
    `;

    // Transaction générale (avec frais notés)
    await tx.$executeRaw`
      INSERT INTO "Transaction" (id, "userId", type, amount, description, "createdAt")
      VALUES (gen_random_uuid()::text, ${userId}, 'dc_sell', ${netEuros}, ${'vente ' + dcAmount.toFixed(4) + ' DC @ ' + price.toFixed(4) + '€ (frais: ' + fee.toFixed(2) + '€)'}, NOW())
    `;
  });

  return {
    success: true,
    dcAmount: dcAmount,
    euroAmount: netEuros,
    newBalance: balance + netEuros,
    newDCBalance: currentDC - dcAmount
  };
}

// ============================================
// STATE
// ============================================

/**
 * Récupère l'état complet du DahkaCoin pour un utilisateur
 */
export async function getDCState(period: "1h" | "24h" | "7d" = "1h"): Promise<DCState> {
  const session = await auth();
  const { price, trend } = await getCurrentPrice();

  // Récupérer l'historique selon la période
  let intervalSql: string;
  switch (period) {
    case "1h":
      intervalSql = "1 hour";
      break;
    case "24h":
      intervalSql = "24 hours";
      break;
    case "7d":
      intervalSql = "7 days";
      break;
  }

  const history = await prisma.$queryRaw<{ price: string; createdAt: Date }[]>`
    SELECT price::text, "createdAt"
    FROM "DahkaCoinPrice"
    WHERE "createdAt" > NOW() - INTERVAL '7 days'
    ORDER BY "createdAt" ASC
  `;

  // Filtrer selon la période côté JS (plus fiable)
  const now = new Date();
  const periodMs = period === "1h" ? 3600000 : period === "24h" ? 86400000 : 604800000;
  const filteredHistory = history.filter(h => now.getTime() - new Date(h.createdAt).getTime() < periodMs);

  const priceHistory = filteredHistory.map(h => ({
    price: parseFloat(h.price),
    createdAt: h.createdAt
  }));

  // Récupérer les dernière mise à jour
  const lastUpdate = history.length > 0 ? history[history.length - 1].createdAt : null;

  // Données utilisateur
  let userDC = 0;
  let userAvgPrice: number | null = null;
  let userProfit: number | null = null;

  if (session?.user?.id) {
    const userData = await prisma.$queryRaw<{ dahkaCoins: string; dcAvgBuyPrice: string | null }[]>`
      SELECT "dahkaCoins"::text, "dcAvgBuyPrice"::text
      FROM "User"
      WHERE id = ${session.user.id}
    `;

    if (userData.length > 0) {
      userDC = parseFloat(userData[0].dahkaCoins);
      userAvgPrice = userData[0].dcAvgBuyPrice ? parseFloat(userData[0].dcAvgBuyPrice) : null;
      
      if (userAvgPrice !== null && userDC > 0) {
        // Profit = (prix actuel - prix moyen d'achat) * quantité
        userProfit = (price - userAvgPrice) * userDC;
      }
    }
  }

  return {
    currentPrice: price,
    trend,
    priceHistory,
    userDC,
    userAvgPrice,
    userProfit,
    lastUpdate
  };
}

/**
 * Récupère l'historique des transactions DC d'un utilisateur
 */
export async function getDCTransactions(limit: number = 20): Promise<{
  id: string;
  type: string;
  dcAmount: number;
  euroAmount: number;
  price: number;
  createdAt: Date;
}[]> {
  const session = await auth();
  if (!session?.user?.id) {
    return [];
  }

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
    createdAt: tx.createdAt
  }));
}
