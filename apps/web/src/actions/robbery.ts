"use server";

import { prisma, Prisma } from "@antibank/db";
import { auth } from "@/lib/auth";
import { getAntibankStats, removeFromAntibank, addToAntibank, ANTIBANK_CORP_ID, ANTIBANK_CORP_NAME } from "@/lib/antibank-corp";

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

// BRAQUAGE ANTIBANK CORP - Très risqué!
// 20% de chances de réussite (80% d'échec)
// Si échec: perd 80% de sa balance
// Si succès: gagne 5% du trésor d'ANTIBANK
export async function attemptAntibankRobbery(): Promise<RobberyResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  const now = Date.now();

  // Récupérer le braqueur
  const robber = await prisma.$queryRaw<[{
    id: string;
    balance: string;
    lastRobberyAt: Date | null;
    discordUsername: string;
  }]>`
    SELECT id, balance::text, "lastRobberyAt", "discordUsername"
    FROM "User"
    WHERE id = ${session.user.id}
  `;

  if (!robber[0]) {
    return { success: false, error: "utilisateur introuvable" };
  }

  const robberData = robber[0];
  const robberBalance = parseFloat(robberData.balance);

  // Vérifier cooldown
  if (robberData.lastRobberyAt) {
    const cooldownEnds = robberData.lastRobberyAt.getTime() + ROBBERY_COOLDOWN_MS;
    if (now < cooldownEnds) {
      return { success: false, error: "cooldown actif", cooldownEnds };
    }
  }

  // Vérifier qu'on a assez pour risquer
  if (robberBalance < 5) {
    return { success: false, error: "minimum 5 euros pour braquer antibank" };
  }

  // Récupérer les stats d'ANTIBANK
  const antibankStats = await getAntibankStats();
  
  if (!antibankStats.canBeRobbed) {
    return { success: false, error: "antibank n'a pas assez (minimum 10 euros)" };
  }

  // Calcul des chances: 20% de base (très risqué!)
  const successChance = 20;
  
  // Lancer le dé
  const roll = Math.floor(Math.random() * 100) + 1;
  const robberySuccess = roll <= successChance;

  let amount: number;
  const nowDate = new Date();

  if (robberySuccess) {
    // Succès! Vole 5% du trésor d'ANTIBANK
    const stealAmount = antibankStats.maxSteal;
    const { newBalance } = await removeFromAntibank(stealAmount);
    amount = stealAmount;

    // Ajouter au braqueur
    await prisma.$executeRaw`
      UPDATE "User" SET balance = balance + ${stealAmount}, "lastRobberyAt" = ${nowDate}
      WHERE id = ${session.user.id}
    `;

    await prisma.transaction.create({
      data: {
        userId: session.user.id,
        type: "antibank_robbery_win",
        amount: new Prisma.Decimal(stealAmount),
        description: `braquage reussi sur ANTIBANK CORP`
      }
    });

  } else {
    // Échec! Perd 80% de sa balance
    const penalty = Math.floor(robberBalance * 0.80 * 100) / 100;
    amount = -penalty;

    await prisma.$executeRaw`
      UPDATE "User" SET balance = balance - ${penalty}, "lastRobberyAt" = ${nowDate}
      WHERE id = ${session.user.id}
    `;

    // L'argent perdu va à ANTIBANK (ajout via import)
    const { addToAntibank } = await import("@/lib/antibank-corp");
    await addToAntibank(penalty, `penalite braquage rate de ${robberData.discordUsername}`);

    await prisma.transaction.create({
      data: {
        userId: session.user.id,
        type: "antibank_robbery_fail",
        amount: new Prisma.Decimal(-penalty),
        description: `braquage rate sur ANTIBANK CORP - penalite 80%`
      }
    });
  }

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

// Récupérer les infos sur ANTIBANK pour l'affichage
export async function getAntibankRobberyInfo(): Promise<{
  canRob: boolean;
  balance: number;
  maxSteal: number;
  riskPercent: number;
  successChance: number;
}> {
  const stats = await getAntibankStats();
  
  return {
    canRob: stats.canBeRobbed,
    balance: stats.balance,
    maxSteal: stats.maxSteal,
    riskPercent: 80, // 80% de perte si échec
    successChance: 20, // 20% de chances
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
