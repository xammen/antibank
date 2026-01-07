"use server";

import { prisma, Prisma } from "@antibank/db";
import { auth } from "@/lib/auth";
import { getAntibankStats, removeFromAntibank, addToAntibank, ANTIBANK_CORP_ID, ANTIBANK_CORP_NAME } from "@/lib/antibank-corp";
import { 
  getHeistProgress, 
  recordHeistAttempt, 
  resetHeistBoosters,
  trackHeistRobberySuccess,
  trackHeistSurvivedRobbery,
  HEIST_CONFIG 
} from "./heist";

// Config braquage
const ROBBERY_COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3h
const MIN_VICTIM_BALANCE = 20; // 20 euros minimum pour se faire braquer
const BASE_SUCCESS_CHANCE = 40; // 40% de base
const STEAL_PERCENT_MIN = 10; // 10% minimum
const STEAL_PERCENT_MAX = 20; // 20% maximum
const FAILURE_PENALTY_PERCENT = 5; // 5% de sa propre balance si echec
const SYSTEM_TAX_PERCENT = 5; // 5% du montant vole va au systeme

interface RobberyResult {
  success: boolean;
  error?: string;
  robbery?: {
    success: boolean;
    amount: number;
    victimName: string;
    chance: number;
    roll: number;
  };
  cooldownEnds?: number;
}

interface RobberyTarget {
  id: string;
  discordUsername: string;
  balance: number;
  hasBounty: boolean;
  bountyAmount: number;
}

export async function getRobberyTargets(): Promise<{ success: boolean; targets?: RobberyTarget[]; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { balance: true }
  });

  if (!user) {
    return { success: false, error: "utilisateur introuvable" };
  }

  const myBalance = Number(user.balance);

  // Raw query car nouveaux modeles pas encore dans les types Prisma locaux
  const potentialTargets = await prisma.$queryRaw<Array<{
    id: string;
    discordUsername: string;
    balance: string;
    bountyAmount: string | null;
  }>>`
    SELECT u.id, u."discordUsername", u.balance::text,
           COALESCE(SUM(b.amount), 0)::text as "bountyAmount"
    FROM "User" u
    LEFT JOIN "Bounty" b ON b."targetId" = u.id 
      AND b.status = 'active' 
      AND b."expiresAt" > NOW()
    WHERE u.id != ${session.user.id}
      AND u.balance >= ${MIN_VICTIM_BALANCE}
      AND u.balance >= ${myBalance}
      AND u."isBanned" = false
    GROUP BY u.id
    ORDER BY u.balance DESC
    LIMIT 20
  `;

  const targets: RobberyTarget[] = potentialTargets.map(t => ({
    id: t.id,
    discordUsername: t.discordUsername,
    balance: parseFloat(t.balance),
    hasBounty: parseFloat(t.bountyAmount || "0") > 0,
    bountyAmount: parseFloat(t.bountyAmount || "0")
  }));

  return { success: true, targets };
}

export async function getRobberyCooldown(): Promise<{ canRob: boolean; cooldownEnds?: number }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { canRob: false };
  }

  const result = await prisma.$queryRaw<[{ lastRobberyAt: Date | null }]>`
    SELECT "lastRobberyAt" FROM "User" WHERE id = ${session.user.id}
  `;

  const lastRobberyAt = result[0]?.lastRobberyAt;
  if (!lastRobberyAt) {
    return { canRob: true };
  }

  const cooldownEnds = lastRobberyAt.getTime() + ROBBERY_COOLDOWN_MS;
  const canRob = Date.now() >= cooldownEnds;

  return { canRob, cooldownEnds: canRob ? undefined : cooldownEnds };
}

export async function attemptRobbery(victimId: string): Promise<RobberyResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  if (session.user.id === victimId) {
    return { success: false, error: "tu peux pas te braquer toi-meme" };
  }

  // Recuperer braqueur et victime avec raw query
  const users = await prisma.$queryRaw<Array<{
    id: string;
    balance: string;
    lastRobberyAt: Date | null;
    discordUsername: string;
    isBanned: boolean;
  }>>`
    SELECT id, balance::text, "lastRobberyAt", "discordUsername", "isBanned"
    FROM "User"
    WHERE id IN (${session.user.id}, ${victimId})
  `;

  const robber = users.find(u => u.id === session.user.id);
  const victim = users.find(u => u.id === victimId);

  if (!robber || !victim) {
    return { success: false, error: "utilisateur introuvable" };
  }

  if (victim.isBanned) {
    return { success: false, error: "cette cible est bannie" };
  }

  const robberBalance = parseFloat(robber.balance);
  const victimBalance = parseFloat(victim.balance);

  // Verifier cooldown
  if (robber.lastRobberyAt) {
    const cooldownEnds = robber.lastRobberyAt.getTime() + ROBBERY_COOLDOWN_MS;
    if (Date.now() < cooldownEnds) {
      return { success: false, error: "cooldown actif", cooldownEnds };
    }
  }

  // Verifier que la victime a assez
  if (victimBalance < MIN_VICTIM_BALANCE) {
    return { success: false, error: `la cible doit avoir au moins ${MIN_VICTIM_BALANCE}` };
  }

  // Verifier qu'on ne braque pas quelqu'un de plus pauvre
  if (victimBalance < robberBalance) {
    return { success: false, error: "tu peux pas braquer quelqu'un de plus pauvre que toi" };
  }

  // Calculer les chances de succes
  let successChance = BASE_SUCCESS_CHANCE;
  
  // Bonus si la cible est 5x plus riche
  if (victimBalance >= robberBalance * 5) {
    successChance += 10;
  }

  // Lancer le de
  const roll = Math.floor(Math.random() * 100) + 1; // 1-100
  const robberySuccess = roll <= successChance;

  let amount: number;
  const now = new Date();

  if (robberySuccess) {
    // Succes: voler 10-20% de la balance de la victime
    const stealPercent = STEAL_PERCENT_MIN + Math.random() * (STEAL_PERCENT_MAX - STEAL_PERCENT_MIN);
    const grossAmount = Math.floor(victimBalance * stealPercent) / 100;
    const tax = Math.floor(grossAmount * SYSTEM_TAX_PERCENT) / 100;
    amount = Math.floor((grossAmount - tax) * 100) / 100;

    // Envoyer la taxe à ANTIBANK CORP
    if (tax > 0) {
      addToAntibank(tax, `taxe braquage sur ${victim.discordUsername}`).catch(() => {});
    }

    // Transaction atomique avec raw queries
    await prisma.$executeRaw`
      UPDATE "User" SET balance = balance - ${grossAmount} WHERE id = ${victimId}
    `;
    
    await prisma.$executeRaw`
      UPDATE "User" SET balance = balance + ${amount}, "lastRobberyAt" = ${now} WHERE id = ${session.user.id}
    `;

    await prisma.$executeRaw`
      INSERT INTO "Robbery" (id, "robberId", "victimId", success, amount, "robberBalance", "victimBalance", "rollChance", "rollResult", "createdAt")
      VALUES (${`rob_${Date.now()}_${Math.random().toString(36).slice(2)}`}, ${session.user.id}, ${victimId}, true, ${amount}, ${robberBalance}, ${victimBalance}, ${successChance}, ${roll}, ${now})
    `;

    await prisma.transaction.create({
      data: {
        userId: session.user.id,
        type: "robbery_gain",
        amount: new Prisma.Decimal(amount),
        description: `braquage reussi sur ${victim.discordUsername}`
      }
    });

    // Track pour la quête heist
    trackHeistRobberySuccess(session.user.id).catch(() => {});

    await prisma.transaction.create({
      data: {
        userId: victimId,
        type: "robbery_loss",
        amount: new Prisma.Decimal(-grossAmount),
        description: `braque par ${robber.discordUsername}`
      }
    });

    // Verifier s'il y a une bounty a claim
    const bounties = await prisma.$queryRaw<Array<{ id: string; amount: string; posterId: string }>>`
      SELECT id, amount::text, "posterId" FROM "Bounty"
      WHERE "targetId" = ${victimId} AND status = 'active' AND "expiresAt" > NOW()
    `;

    if (bounties.length > 0) {
      for (const bounty of bounties) {
        const bountyAmount = parseFloat(bounty.amount);
        
        await prisma.$executeRaw`
          UPDATE "Bounty" SET status = 'claimed', "claimerId" = ${session.user.id}, "claimedAt" = ${now}
          WHERE id = ${bounty.id}
        `;

        await prisma.$executeRaw`
          UPDATE "User" SET balance = balance + ${bountyAmount} WHERE id = ${session.user.id}
        `;

        await prisma.transaction.create({
          data: {
            userId: session.user.id,
            type: "bounty_claimed",
            amount: new Prisma.Decimal(bountyAmount),
            description: `prime sur ${victim.discordUsername}`
          }
        });

        amount += bountyAmount;
      }
    }

  } else {
    // Echec: perdre 5% de sa propre balance (minimum 1 euro)
    const penalty = Math.max(1, Math.floor(robberBalance * FAILURE_PENALTY_PERCENT) / 100);
    amount = -penalty;

    await prisma.$executeRaw`
      UPDATE "User" SET balance = balance - ${penalty}, "lastRobberyAt" = ${now} WHERE id = ${session.user.id}
    `;

    await prisma.$executeRaw`
      INSERT INTO "Robbery" (id, "robberId", "victimId", success, amount, "robberBalance", "victimBalance", "rollChance", "rollResult", "createdAt")
      VALUES (${`rob_${Date.now()}_${Math.random().toString(36).slice(2)}`}, ${session.user.id}, ${victimId}, false, ${penalty}, ${robberBalance}, ${victimBalance}, ${successChance}, ${roll}, ${now})
    `;

    await prisma.transaction.create({
      data: {
        userId: session.user.id,
        type: "robbery_fail",
        amount: new Prisma.Decimal(-penalty),
        description: `braquage rate sur ${victim.discordUsername}`
      }
    });

    // La victime a survécu - track pour sa quête heist
    trackHeistSurvivedRobbery(victimId).catch(() => {});
  }

  return {
    success: true,
    robbery: {
      success: robberySuccess,
      amount: Math.abs(amount),
      victimName: victim.discordUsername,
      chance: successChance,
      roll
    }
  };
}

// BRAQUAGE ANTIBANK CORP - Système de quête
// Nécessite de compléter les stages 1-3, puis conditions stage 5 en temps réel
// Stats avec boosters: 30-45% chance, 8-18% vol, 40-60% perte si échec
export async function attemptAntibankRobbery(): Promise<RobberyResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  // Vérifier la progression de la quête
  const heistProgress = await getHeistProgress();
  if (!heistProgress) {
    return { success: false, error: "erreur chargement progression" };
  }

  // Vérifier que les stages 1-3 sont complétés
  if (!heistProgress.stages[2].complete) {
    return { success: false, error: "complete les stages 1-3 d'abord" };
  }

  // Vérifier le cooldown heist (séparé du cooldown braquage normal)
  if (heistProgress.cooldownEndsAt) {
    return { success: false, error: "cooldown heist actif", cooldownEnds: heistProgress.cooldownEndsAt };
  }

  // Vérifier conditions stage 5 en temps réel
  const stage5 = heistProgress.stages[4];
  const voiceCheck = stage5.requirements.find(r => r.id === "voice_others");
  const feeCheck = stage5.requirements.find(r => r.id === "entry_fee");

  if (!voiceCheck?.complete) {
    return { success: false, error: "tu dois etre en vocal avec 2+ personnes" };
  }

  if (!feeCheck?.complete) {
    return { success: false, error: "tu dois avoir 100€ minimum (frais d'entree)" };
  }

  // Récupérer le braqueur
  const robber = await prisma.$queryRaw<[{
    id: string;
    balance: string;
    discordUsername: string;
  }]>`
    SELECT id, balance::text, "discordUsername"
    FROM "User"
    WHERE id = ${session.user.id}
  `;

  if (!robber[0]) {
    return { success: false, error: "utilisateur introuvable" };
  }

  const robberData = robber[0];
  const robberBalance = parseFloat(robberData.balance);

  // Récupérer les stats d'ANTIBANK
  const antibankStats = await getAntibankStats();
  
  if (!antibankStats.canBeRobbed) {
    return { success: false, error: "antibank n'a pas assez (minimum 10 euros)" };
  }

  // Déduire les frais d'entrée (100€)
  const entryFee = HEIST_CONFIG.ENTRY_FEE;
  
  // Vérifier les items requis et optionnels
  const inventory = await prisma.inventoryItem.findMany({
    where: { 
      userId: session.user.id,
      itemId: { in: ["pied_de_biche", "kit_crochetage", "gilet_pare_balles", "vpn"] },
      charges: { not: 0 },
    },
    select: { id: true, itemId: true, charges: true, expiresAt: true },
  });

  const hasItem = (itemId: string) => {
    const item = inventory.find((i: { itemId: string; expiresAt: Date | null; charges: number }) => i.itemId === itemId);
    if (!item) return false;
    if (item.expiresAt && item.expiresAt < new Date()) return false;
    return item.charges !== 0;
  };

  if (!hasItem("pied_de_biche")) {
    return { success: false, error: "tu as besoin d'un pied-de-biche" };
  }
  if (!hasItem("kit_crochetage")) {
    return { success: false, error: "tu as besoin d'un kit de crochetage" };
  }

  // Calcul des stats finales
  const { finalStats, bonuses } = heistProgress;
  const successChance = finalStats.successChance;
  const treasuryStealPercent = finalStats.treasurySteal;
  const failLossPercent = finalStats.failLoss;
  
  // Lancer le dé
  const roll = Math.floor(Math.random() * 100) + 1;
  const robberySuccess = roll <= successChance;

  let amount: number;
  const nowDate = new Date();

  // Déduire les frais d'entrée d'abord
  await prisma.$executeRaw`
    UPDATE "User" SET balance = balance - ${entryFee}
    WHERE id = ${session.user.id}
  `;

  await prisma.transaction.create({
    data: {
      userId: session.user.id,
      type: "antibank_heist_fee",
      amount: new Prisma.Decimal(-entryFee),
      description: `frais d'entree braquage ANTIBANK`
    }
  });

  // Consommer les items requis
  for (const item of inventory) {
    if (item.itemId === "pied_de_biche" || item.itemId === "kit_crochetage") {
      if (item.charges > 0) {
        await prisma.inventoryItem.update({
          where: { id: item.id },
          data: { charges: { decrement: 1 } },
        });
      }
    }
  }

  if (robberySuccess) {
    // Succès! Vole X% du trésor d'ANTIBANK
    const stealAmount = Math.floor(antibankStats.balance * treasuryStealPercent) / 100;
    await removeFromAntibank(stealAmount);
    amount = stealAmount;

    // Ajouter au braqueur
    await prisma.$executeRaw`
      UPDATE "User" SET balance = balance + ${stealAmount}
      WHERE id = ${session.user.id}
    `;

    await prisma.transaction.create({
      data: {
        userId: session.user.id,
        type: "antibank_heist_win",
        amount: new Prisma.Decimal(stealAmount),
        description: `braquage ANTIBANK reussi! (${treasuryStealPercent}% du tresor)`
      }
    });

  } else {
    // Échec! Perd X% de sa balance restante (après frais)
    const balanceAfterFee = robberBalance - entryFee;
    const penalty = Math.floor(balanceAfterFee * failLossPercent) / 100;
    amount = -penalty;

    await prisma.$executeRaw`
      UPDATE "User" SET balance = balance - ${penalty}
      WHERE id = ${session.user.id}
    `;

    // L'argent perdu va à ANTIBANK
    await addToAntibank(penalty, `penalite heist rate de ${robberData.discordUsername}`);

    await prisma.transaction.create({
      data: {
        userId: session.user.id,
        type: "antibank_heist_fail",
        amount: new Prisma.Decimal(-penalty),
        description: `braquage ANTIBANK rate - penalite ${failLossPercent}%`
      }
    });
  }

  // Enregistrer la tentative et reset les boosters
  await recordHeistAttempt(session.user.id, robberySuccess);
  await resetHeistBoosters(session.user.id);

  return {
    success: true,
    robbery: {
      success: robberySuccess,
      amount: Math.abs(amount),
      victimName: ANTIBANK_CORP_NAME,
      chance: successChance,
      roll
    }
  };
}

// Récupérer les infos sur ANTIBANK pour l'affichage (utilise le système de quête)
export async function getAntibankRobberyInfo(): Promise<{
  canRob: boolean;
  balance: number;
  maxSteal: number;
  riskPercent: number;
  successChance: number;
  entryFee: number;
  heistProgress: Awaited<ReturnType<typeof getHeistProgress>>;
}> {
  const stats = await getAntibankStats();
  const heistProgress = await getHeistProgress();
  
  // Stats finales basées sur la progression
  const finalStats = heistProgress?.finalStats || {
    successChance: HEIST_CONFIG.BASE_SUCCESS_CHANCE,
    treasurySteal: HEIST_CONFIG.BASE_TREASURY_STEAL,
    failLoss: HEIST_CONFIG.BASE_FAIL_LOSS,
  };
  
  return {
    canRob: stats.canBeRobbed && (heistProgress?.canAttemptHeist || false),
    balance: stats.balance,
    maxSteal: Math.floor(stats.balance * finalStats.treasurySteal) / 100,
    riskPercent: finalStats.failLoss,
    successChance: finalStats.successChance,
    entryFee: HEIST_CONFIG.ENTRY_FEE,
    heistProgress,
  };
}

export async function getRobberyHistory(limit: number = 10): Promise<{
  success: boolean;
  history?: Array<{
    id: string;
    success: boolean;
    amount: number;
    victimName?: string;
    robberName?: string;
    isRobber: boolean;
    createdAt: Date;
  }>;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false };
  }

  const robberies = await prisma.$queryRaw<Array<{
    id: string;
    success: boolean;
    amount: string;
    robberId: string;
    victimId: string;
    createdAt: Date;
    robberName: string;
    victimName: string;
  }>>`
    SELECT r.id, r.success, r.amount::text, r."robberId", r."victimId", r."createdAt",
           robber."discordUsername" as "robberName",
           victim."discordUsername" as "victimName"
    FROM "Robbery" r
    JOIN "User" robber ON r."robberId" = robber.id
    JOIN "User" victim ON r."victimId" = victim.id
    WHERE r."robberId" = ${session.user.id} OR r."victimId" = ${session.user.id}
    ORDER BY r."createdAt" DESC
    LIMIT ${limit}
  `;

  return {
    success: true,
    history: robberies.map(r => ({
      id: r.id,
      success: r.success,
      amount: parseFloat(r.amount),
      victimName: r.robberId === session.user.id ? r.victimName : undefined,
      robberName: r.victimId === session.user.id ? r.robberName : undefined,
      isRobber: r.robberId === session.user.id,
      createdAt: r.createdAt
    }))
  };
}
