"use server";

import { prisma, Prisma } from "@antibank/db";
import { auth } from "@/lib/auth";

// Config justice
const WARN_COST = 0.20; // Cout pour lancer un warn
const WARN_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const WARN_MIN_AMOUNT = 0.50;
const WARN_MAX_PERCENT = 100; // Max 100% du solde de l'accuse (pas de limite)
const WARN_MIN_ACCUSED_BALANCE = 2; // L'accuse doit avoir au moins 2 euros
const WARN_QUORUM = 3; // Minimum 3 votants

const REVOLUTION_COST = 3; // Cout pour lancer une revolution
const REVOLUTION_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const REVOLUTION_COOLDOWN_MS = 48 * 60 * 60 * 1000; // 48h global cooldown
const REVOLUTION_THRESHOLD = 3; // Le plus riche doit avoir 3x la mediane
const REVOLUTION_REQUIRED_PERCENT = 60; // 60% pour passer

interface WarnResult {
  success: boolean;
  error?: string;
  warn?: {
    id: string;
    accusedName: string;
    amount: number;
    endsAt: Date;
  };
}

interface ActiveWarn {
  id: string;
  accuserId: string;
  accuserName: string;
  accusedId: string;
  accusedName: string;
  reason: string;
  amount: number;
  guiltyVotes: number;
  innocentVotes: number;
  endsAt: Date;
  myVote?: string;
}

export async function getActiveWarns(): Promise<{ success: boolean; warns?: ActiveWarn[]; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  const warns = await prisma.$queryRaw<Array<{
    id: string;
    accuserId: string;
    accuserName: string;
    accusedId: string;
    accusedName: string;
    reason: string;
    amount: string;
    guiltyVotes: number;
    innocentVotes: number;
    endsAt: Date;
  }>>`
    SELECT w.id, w."accuserId", accuser."discordUsername" as "accuserName",
           w."accusedId", accused."discordUsername" as "accusedName",
           w.reason, w.amount::text, w."guiltyVotes", w."innocentVotes", w."endsAt"
    FROM "WarnVote" w
    JOIN "User" accuser ON w."accuserId" = accuser.id
    JOIN "User" accused ON w."accusedId" = accused.id
    WHERE w.status = 'voting' AND w."endsAt" > NOW()
    ORDER BY w."endsAt" ASC
  `;

  // Recuperer les votes de l'utilisateur
  const warnIds = warns.map(w => w.id);
  let myVotes: Record<string, string> = {};
  
  if (warnIds.length > 0) {
    const ballots = await prisma.$queryRaw<Array<{ warnVoteId: string; vote: string }>>`
      SELECT "warnVoteId", vote FROM "WarnBallot"
      WHERE "odrzerId" = ${session.user.id} AND "warnVoteId" = ANY(${warnIds}::text[])
    `;
    myVotes = Object.fromEntries(ballots.map(b => [b.warnVoteId, b.vote]));
  }

  return {
    success: true,
    warns: warns.map(w => ({
      id: w.id,
      accuserId: w.accuserId,
      accuserName: w.accuserName,
      accusedId: w.accusedId,
      accusedName: w.accusedName,
      reason: w.reason,
      amount: parseFloat(w.amount),
      guiltyVotes: w.guiltyVotes,
      innocentVotes: w.innocentVotes,
      endsAt: w.endsAt,
      myVote: myVotes[w.id]
    }))
  };
}

export async function createWarn(accusedId: string, reason: string, amount: number): Promise<WarnResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  if (session.user.id === accusedId) {
    return { success: false, error: "tu peux pas te warn toi-meme" };
  }

  if (amount < WARN_MIN_AMOUNT) {
    return { success: false, error: `minimum ${WARN_MIN_AMOUNT} euro` };
  }

  if (!reason || reason.trim().length < 3) {
    return { success: false, error: "raison trop courte" };
  }

  // Verifier les utilisateurs
  const users = await prisma.$queryRaw<Array<{
    id: string;
    balance: string;
    discordUsername: string;
  }>>`
    SELECT id, balance::text, "discordUsername"
    FROM "User"
    WHERE id IN (${session.user.id}, ${accusedId})
  `;

  const accuser = users.find(u => u.id === session.user.id);
  const accused = users.find(u => u.id === accusedId);

  if (!accuser || !accused) {
    return { success: false, error: "utilisateur introuvable" };
  }

  const accuserBalance = parseFloat(accuser.balance);
  const accusedBalance = parseFloat(accused.balance);

  if (accuserBalance < WARN_COST) {
    return { success: false, error: `il te faut ${WARN_COST} pour lancer un warn` };
  }

  if (accusedBalance < WARN_MIN_ACCUSED_BALANCE) {
    return { success: false, error: `l'accuse doit avoir au moins ${WARN_MIN_ACCUSED_BALANCE}` };
  }

  // Calculer le montant max (100% du solde de l'accusé)
  const maxAmount = accusedBalance * WARN_MAX_PERCENT / 100;
  if (amount > maxAmount) {
    return { success: false, error: `montant max: ${maxAmount.toFixed(2)}€` };
  }

  const now = new Date();
  const endsAt = new Date(now.getTime() + WARN_DURATION_MS);
  const warnId = `warn_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // Deduire le cout et creer le warn
  await prisma.$executeRaw`
    UPDATE "User" SET balance = balance - ${WARN_COST} WHERE id = ${session.user.id}
  `;

  await prisma.$executeRaw`
    INSERT INTO "WarnVote" (id, "accuserId", "accusedId", reason, amount, status, "guiltyVotes", "innocentVotes", "endsAt", "createdAt")
    VALUES (${warnId}, ${session.user.id}, ${accusedId}, ${reason.trim()}, ${amount}, 'voting', 0, 0, ${endsAt}, ${now})
  `;

  await prisma.transaction.create({
    data: {
      userId: session.user.id,
      type: "warn_cost",
      amount: new Prisma.Decimal(-WARN_COST),
      description: `warn contre ${accused.discordUsername}`
    }
  });

  return {
    success: true,
    warn: {
      id: warnId,
      accusedName: accused.discordUsername,
      amount,
      endsAt
    }
  };
}

export async function voteOnWarn(warnId: string, vote: "guilty" | "innocent"): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  // Verifier le warn
  const warns = await prisma.$queryRaw<Array<{
    id: string;
    accuserId: string;
    accusedId: string;
    status: string;
    endsAt: Date;
  }>>`
    SELECT id, "accuserId", "accusedId", status, "endsAt"
    FROM "WarnVote"
    WHERE id = ${warnId}
  `;

  const warn = warns[0];
  if (!warn) {
    return { success: false, error: "warn introuvable" };
  }

  if (warn.status !== "voting") {
    return { success: false, error: "vote termine" };
  }

  if (new Date(warn.endsAt) < new Date()) {
    return { success: false, error: "vote expire" };
  }

  // Ne peut pas voter sur son propre warn (comme accuse ou accuseur)
  if (warn.accuserId === session.user.id || warn.accusedId === session.user.id) {
    return { success: false, error: "tu peux pas voter sur ton propre warn" };
  }

  // Verifier si deja vote
  const existing = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "WarnBallot"
    WHERE "warnVoteId" = ${warnId} AND "odrzerId" = ${session.user.id}
  `;

  if (Number(existing[0]?.count || 0) > 0) {
    return { success: false, error: "tu as deja vote" };
  }

  const ballotId = `ballot_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const now = new Date();

  // Creer le bulletin et mettre a jour les compteurs
  await prisma.$executeRaw`
    INSERT INTO "WarnBallot" (id, "warnVoteId", "odrzerId", vote, "createdAt")
    VALUES (${ballotId}, ${warnId}, ${session.user.id}, ${vote}, ${now})
  `;

  if (vote === "guilty") {
    await prisma.$executeRaw`
      UPDATE "WarnVote" SET "guiltyVotes" = "guiltyVotes" + 1 WHERE id = ${warnId}
    `;
  } else {
    await prisma.$executeRaw`
      UPDATE "WarnVote" SET "innocentVotes" = "innocentVotes" + 1 WHERE id = ${warnId}
    `;
  }

  return { success: true };
}

export async function resolveExpiredWarns(): Promise<{ resolved: number }> {
  const now = new Date();

  // Trouver les warns expires
  const expiredWarns = await prisma.$queryRaw<Array<{
    id: string;
    accuserId: string;
    accusedId: string;
    amount: string;
    guiltyVotes: number;
    innocentVotes: number;
  }>>`
    SELECT id, "accuserId", "accusedId", amount::text, "guiltyVotes", "innocentVotes"
    FROM "WarnVote"
    WHERE status = 'voting' AND "endsAt" <= ${now}
  `;

  let resolved = 0;

  for (const warn of expiredWarns) {
    const totalVotes = warn.guiltyVotes + warn.innocentVotes;
    const amount = parseFloat(warn.amount);

    if (totalVotes < WARN_QUORUM) {
      // Pas assez de votes - expire sans effet
      await prisma.$executeRaw`
        UPDATE "WarnVote" SET status = 'expired', "resolvedAt" = ${now} WHERE id = ${warn.id}
      `;
    } else if (warn.guiltyVotes > warn.innocentVotes) {
      // Coupable - appliquer l'amende
      const voterShare = amount * 0.5 / warn.guiltyVotes; // 50% reparti entre votants guilty

      // Retirer l'amende a l'accuse
      await prisma.$executeRaw`
        UPDATE "User" SET balance = balance - ${amount} WHERE id = ${warn.accusedId}
      `;

      // Distribuer aux votants guilty
      const guiltyVoters = await prisma.$queryRaw<Array<{ odrzerId: string }>>`
        SELECT "odrzerId" FROM "WarnBallot"
        WHERE "warnVoteId" = ${warn.id} AND vote = 'guilty'
      `;

      for (const voter of guiltyVoters) {
        await prisma.$executeRaw`
          UPDATE "User" SET balance = balance + ${voterShare} WHERE id = ${voter.odrzerId}
        `;
        await prisma.transaction.create({
          data: {
            userId: voter.odrzerId,
            type: "warn_reward",
            amount: new Prisma.Decimal(voterShare),
            description: "vote coupable"
          }
        });
      }

      await prisma.transaction.create({
        data: {
          userId: warn.accusedId,
          type: "warn_fine",
          amount: new Prisma.Decimal(-amount),
          description: "amende pour warn"
        }
      });

      await prisma.$executeRaw`
        UPDATE "WarnVote" SET status = 'guilty', "resolvedAt" = ${now} WHERE id = ${warn.id}
      `;
    } else {
      // Innocent - l'accuseur paie 50% a l'accuse
      const penalty = amount * 0.5;

      await prisma.$executeRaw`
        UPDATE "User" SET balance = balance - ${penalty} WHERE id = ${warn.accuserId}
      `;
      await prisma.$executeRaw`
        UPDATE "User" SET balance = balance + ${penalty} WHERE id = ${warn.accusedId}
      `;

      await prisma.transaction.create({
        data: {
          userId: warn.accuserId,
          type: "warn_penalty",
          amount: new Prisma.Decimal(-penalty),
          description: "warn rejete"
        }
      });
      await prisma.transaction.create({
        data: {
          userId: warn.accusedId,
          type: "warn_compensation",
          amount: new Prisma.Decimal(penalty),
          description: "compensation warn"
        }
      });

      await prisma.$executeRaw`
        UPDATE "WarnVote" SET status = 'innocent', "resolvedAt" = ${now} WHERE id = ${warn.id}
      `;
    }

    resolved++;
  }

  return { resolved };
}

export async function getWarnTargets(): Promise<{ 
  success: boolean; 
  targets?: Array<{ id: string; discordUsername: string; balance: number }>;
  error?: string 
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  const targets = await prisma.$queryRaw<Array<{
    id: string;
    discordUsername: string;
    balance: string;
  }>>`
    SELECT id, "discordUsername", balance::text
    FROM "User"
    WHERE id != ${session.user.id}
      AND "isBanned" = false
      AND balance >= ${WARN_MIN_ACCUSED_BALANCE}
    ORDER BY "discordUsername" ASC
    LIMIT 50
  `;

  return {
    success: true,
    targets: targets.map(t => ({
      id: t.id,
      discordUsername: t.discordUsername,
      balance: parseFloat(t.balance)
    }))
  };
}

// ============================================
// WARN HISTORY
// ============================================

interface WarnHistoryItem {
  id: string;
  accuserName: string;
  accusedName: string;
  reason: string;
  amount: number;
  status: string;
  guiltyVotes: number;
  innocentVotes: number;
  resolvedAt: Date;
}

export async function getWarnHistory(limit: number = 20): Promise<{ 
  success: boolean; 
  history?: WarnHistoryItem[];
  error?: string 
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  const history = await prisma.$queryRaw<Array<{
    id: string;
    accuserName: string;
    accusedName: string;
    reason: string;
    amount: string;
    status: string;
    guiltyVotes: number;
    innocentVotes: number;
    resolvedAt: Date;
  }>>`
    SELECT w.id, accuser."discordUsername" as "accuserName",
           accused."discordUsername" as "accusedName",
           w.reason, w.amount::text, w.status,
           w."guiltyVotes", w."innocentVotes", w."resolvedAt"
    FROM "WarnVote" w
    JOIN "User" accuser ON w."accuserId" = accuser.id
    JOIN "User" accused ON w."accusedId" = accused.id
    WHERE w.status IN ('guilty', 'innocent', 'expired')
    ORDER BY w."resolvedAt" DESC
    LIMIT ${limit}
  `;

  return {
    success: true,
    history: history.map(h => ({
      id: h.id,
      accuserName: h.accuserName,
      accusedName: h.accusedName,
      reason: h.reason,
      amount: parseFloat(h.amount),
      status: h.status,
      guiltyVotes: h.guiltyVotes,
      innocentVotes: h.innocentVotes,
      resolvedAt: h.resolvedAt
    }))
  };
}

// ============================================
// REVOLUTION
// ============================================

interface RevolutionInfo {
  id: string;
  initiatorName: string;
  targetName: string;
  targetBalance: number;
  medianBalance: number;
  forVotes: number;
  againstVotes: number;
  endsAt: Date;
  myVote?: string;
}

export async function getActiveRevolution(): Promise<{ 
  success: boolean; 
  revolution?: RevolutionInfo; 
  canStart?: boolean;
  richestName?: string;
  richestBalance?: number;
  medianBalance?: number;
  error?: string 
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  // Chercher une revolution active
  const revolutions = await prisma.$queryRaw<Array<{
    id: string;
    initatorId: string;
    initiatorName: string;
    targetId: string;
    targetName: string;
    targetBalance: string;
    medianBalance: string;
    forVotes: number;
    againstVotes: number;
    endsAt: Date;
  }>>`
    SELECT r.id, r."initatorId", initiator."discordUsername" as "initiatorName",
           r."targetId", target."discordUsername" as "targetName",
           r."targetBalance"::text, r."medianBalance"::text,
           r."forVotes", r."againstVotes", r."endsAt"
    FROM "Revolution" r
    JOIN "User" initiator ON r."initatorId" = initiator.id
    JOIN "User" target ON r."targetId" = target.id
    WHERE r.status = 'voting' AND r."endsAt" > NOW()
    LIMIT 1
  `;

  if (revolutions.length > 0) {
    const rev = revolutions[0];
    
    // Recuperer le vote de l'utilisateur
    const ballots = await prisma.$queryRaw<Array<{ vote: string }>>`
      SELECT vote FROM "RevolutionBallot"
      WHERE "revolutionId" = ${rev.id} AND "odrzerId" = ${session.user.id}
    `;

    return {
      success: true,
      revolution: {
        id: rev.id,
        initiatorName: rev.initiatorName,
        targetName: rev.targetName,
        targetBalance: parseFloat(rev.targetBalance),
        medianBalance: parseFloat(rev.medianBalance),
        forVotes: rev.forVotes,
        againstVotes: rev.againstVotes,
        endsAt: rev.endsAt,
        myVote: ballots[0]?.vote
      }
    };
  }

  // Pas de revolution active - verifier si on peut en lancer une
  // Calculer la mediane et trouver le plus riche
  const balances = await prisma.$queryRaw<Array<{ balance: string }>>`
    SELECT balance::text FROM "User"
    WHERE "isBanned" = false
    ORDER BY balance ASC
  `;

  if (balances.length < 3) {
    return { success: true, canStart: false };
  }

  const balanceValues = balances.map(b => parseFloat(b.balance));
  const median = balanceValues[Math.floor(balanceValues.length / 2)];
  const richest = balanceValues[balanceValues.length - 1];

  // Trouver le plus riche
  const richestUser = await prisma.$queryRaw<[{ id: string; discordUsername: string; balance: string }]>`
    SELECT id, "discordUsername", balance::text FROM "User"
    WHERE "isBanned" = false
    ORDER BY balance DESC
    LIMIT 1
  `;

  const canStart = richest >= median * REVOLUTION_THRESHOLD;

  // Verifier cooldown global
  const recentRevolution = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "Revolution"
    WHERE "createdAt" > NOW() - INTERVAL '48 hours'
  `;

  const onCooldown = Number(recentRevolution[0]?.count || 0) > 0;

  return {
    success: true,
    canStart: canStart && !onCooldown,
    richestName: richestUser[0]?.discordUsername,
    richestBalance: parseFloat(richestUser[0]?.balance || "0"),
    medianBalance: median
  };
}

export async function startRevolution(): Promise<{ success: boolean; error?: string; revolution?: RevolutionInfo }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  // Verifier qu'il n'y a pas de revolution active
  const active = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "Revolution"
    WHERE status = 'voting' AND "endsAt" > NOW()
  `;

  if (Number(active[0]?.count || 0) > 0) {
    return { success: false, error: "revolution deja en cours" };
  }

  // Verifier cooldown
  const recent = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "Revolution"
    WHERE "createdAt" > NOW() - INTERVAL '48 hours'
  `;

  if (Number(recent[0]?.count || 0) > 0) {
    return { success: false, error: "cooldown global (48h)" };
  }

  // Verifier le solde de l'initiateur
  const initiator = await prisma.$queryRaw<[{ balance: string }]>`
    SELECT balance::text FROM "User" WHERE id = ${session.user.id}
  `;

  if (parseFloat(initiator[0]?.balance || "0") < REVOLUTION_COST) {
    return { success: false, error: `il te faut ${REVOLUTION_COST} pour lancer une revolution` };
  }

  // Calculer mediane et trouver le plus riche
  const balances = await prisma.$queryRaw<Array<{ balance: string }>>`
    SELECT balance::text FROM "User" WHERE "isBanned" = false ORDER BY balance ASC
  `;

  const balanceValues = balances.map(b => parseFloat(b.balance));
  const median = balanceValues[Math.floor(balanceValues.length / 2)];
  const richest = balanceValues[balanceValues.length - 1];

  if (richest < median * REVOLUTION_THRESHOLD) {
    return { success: false, error: `le plus riche doit avoir ${REVOLUTION_THRESHOLD}x la mediane` };
  }

  const richestUser = await prisma.$queryRaw<[{ id: string; discordUsername: string; balance: string }]>`
    SELECT id, "discordUsername", balance::text FROM "User"
    WHERE "isBanned" = false ORDER BY balance DESC LIMIT 1
  `;

  if (richestUser[0].id === session.user.id) {
    return { success: false, error: "tu peux pas lancer une revolution contre toi-meme" };
  }

  const now = new Date();
  const endsAt = new Date(now.getTime() + REVOLUTION_DURATION_MS);
  const revId = `rev_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // Deduire le cout et creer la revolution
  await prisma.$executeRaw`
    UPDATE "User" SET balance = balance - ${REVOLUTION_COST} WHERE id = ${session.user.id}
  `;

  await prisma.$executeRaw`
    INSERT INTO "Revolution" (id, "initatorId", "targetId", status, "forVotes", "againstVotes", "targetBalance", "medianBalance", "endsAt", "createdAt")
    VALUES (${revId}, ${session.user.id}, ${richestUser[0].id}, 'voting', 0, 0, ${richest}, ${median}, ${endsAt}, ${now})
  `;

  await prisma.transaction.create({
    data: {
      userId: session.user.id,
      type: "revolution_cost",
      amount: new Prisma.Decimal(-REVOLUTION_COST),
      description: "lancement revolution"
    }
  });

  return {
    success: true,
    revolution: {
      id: revId,
      initiatorName: "", // Will be filled by getActiveRevolution
      targetName: richestUser[0].discordUsername,
      targetBalance: richest,
      medianBalance: median,
      forVotes: 0,
      againstVotes: 0,
      endsAt
    }
  };
}

export async function voteOnRevolution(vote: "for" | "against"): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  // Trouver la revolution active
  const revolutions = await prisma.$queryRaw<Array<{ id: string; initatorId: string; targetId: string; endsAt: Date }>>`
    SELECT id, "initatorId", "targetId", "endsAt" FROM "Revolution"
    WHERE status = 'voting' AND "endsAt" > NOW()
    LIMIT 1
  `;

  if (revolutions.length === 0) {
    return { success: false, error: "pas de revolution active" };
  }

  const rev = revolutions[0];

  // Le plus riche ne peut pas voter
  if (rev.targetId === session.user.id) {
    return { success: false, error: "tu es la cible, tu peux pas voter" };
  }

  // Verifier si deja vote
  const existing = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "RevolutionBallot"
    WHERE "revolutionId" = ${rev.id} AND "odrzerId" = ${session.user.id}
  `;

  if (Number(existing[0]?.count || 0) > 0) {
    return { success: false, error: "tu as deja vote" };
  }

  const ballotId = `revballot_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const now = new Date();

  await prisma.$executeRaw`
    INSERT INTO "RevolutionBallot" (id, "revolutionId", "odrzerId", vote, "createdAt")
    VALUES (${ballotId}, ${rev.id}, ${session.user.id}, ${vote}, ${now})
  `;

  if (vote === "for") {
    await prisma.$executeRaw`
      UPDATE "Revolution" SET "forVotes" = "forVotes" + 1 WHERE id = ${rev.id}
    `;
  } else {
    await prisma.$executeRaw`
      UPDATE "Revolution" SET "againstVotes" = "againstVotes" + 1 WHERE id = ${rev.id}
    `;
  }

  return { success: true };
}

export async function resolveExpiredRevolutions(): Promise<{ resolved: number }> {
  const now = new Date();

  const expiredRevs = await prisma.$queryRaw<Array<{
    id: string;
    targetId: string;
    targetBalance: string;
    forVotes: number;
    againstVotes: number;
  }>>`
    SELECT id, "targetId", "targetBalance"::text, "forVotes", "againstVotes"
    FROM "Revolution"
    WHERE status = 'voting' AND "endsAt" <= ${now}
  `;

  let resolved = 0;

  for (const rev of expiredRevs) {
    const totalVotes = rev.forVotes + rev.againstVotes;
    
    // Compter les joueurs actifs (ont vote ou ont plus de 1 euro)
    const activeUsers = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "User" WHERE "isBanned" = false AND balance > 1
    `;
    const activeCount = Number(activeUsers[0]?.count || 1);
    
    const requiredVotes = Math.ceil(activeCount * REVOLUTION_REQUIRED_PERCENT / 100);
    const targetBalance = parseFloat(rev.targetBalance);

    if (rev.forVotes >= requiredVotes) {
      // Revolution reussie - redistribuer 40% de la fortune du riche
      const redistribution = targetBalance * 0.4;
      const perVoter = redistribution / rev.forVotes;

      await prisma.$executeRaw`
        UPDATE "User" SET balance = balance - ${redistribution} WHERE id = ${rev.targetId}
      `;

      // Donner aux votants "for"
      const forVoters = await prisma.$queryRaw<Array<{ odrzerId: string }>>`
        SELECT "odrzerId" FROM "RevolutionBallot"
        WHERE "revolutionId" = ${rev.id} AND vote = 'for'
      `;

      for (const voter of forVoters) {
        await prisma.$executeRaw`
          UPDATE "User" SET balance = balance + ${perVoter} WHERE id = ${voter.odrzerId}
        `;
        await prisma.transaction.create({
          data: {
            userId: voter.odrzerId,
            type: "revolution_win",
            amount: new Prisma.Decimal(perVoter),
            description: "revolution reussie"
          }
        });
      }

      await prisma.transaction.create({
        data: {
          userId: rev.targetId,
          type: "revolution_loss",
          amount: new Prisma.Decimal(-redistribution),
          description: "revolution contre toi"
        }
      });

      await prisma.$executeRaw`
        UPDATE "Revolution" SET status = 'success', "resolvedAt" = ${now} WHERE id = ${rev.id}
      `;
    } else {
      // Revolution echouee
      // Les votants "for" perdent 10%
      const forVoters = await prisma.$queryRaw<Array<{ odrzerId: string }>>`
        SELECT "odrzerId" FROM "RevolutionBallot"
        WHERE "revolutionId" = ${rev.id} AND vote = 'for'
      `;

      for (const voter of forVoters) {
        const voterBalance = await prisma.$queryRaw<[{ balance: string }]>`
          SELECT balance::text FROM "User" WHERE id = ${voter.odrzerId}
        `;
        const penalty = parseFloat(voterBalance[0]?.balance || "0") * 0.1;

        await prisma.$executeRaw`
          UPDATE "User" SET balance = balance - ${penalty} WHERE id = ${voter.odrzerId}
        `;
        await prisma.transaction.create({
          data: {
            userId: voter.odrzerId,
            type: "revolution_penalty",
            amount: new Prisma.Decimal(-penalty),
            description: "revolution echouee"
          }
        });
      }

      // Le riche gagne 5% bonus
      const bonus = targetBalance * 0.05;
      await prisma.$executeRaw`
        UPDATE "User" SET balance = balance + ${bonus} WHERE id = ${rev.targetId}
      `;
      await prisma.transaction.create({
        data: {
          userId: rev.targetId,
          type: "revolution_survive",
          amount: new Prisma.Decimal(bonus),
          description: "revolution survecue"
        }
      });

      await prisma.$executeRaw`
        UPDATE "Revolution" SET status = 'failed', "resolvedAt" = ${now} WHERE id = ${rev.id}
      `;
    }

    resolved++;
  }

  return { resolved };
}

// ============================================
// SKIP VOTE TIMERS (admin/debug)
// ============================================

export async function skipWarnTimer(warnId: string): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  // Verifier que le warn existe et est en cours
  const warn = await prisma.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT id, status FROM "WarnVote" WHERE id = ${warnId}
  `;

  if (!warn[0]) {
    return { success: false, error: "warn introuvable" };
  }

  if (warn[0].status !== "voting") {
    return { success: false, error: "vote deja termine" };
  }

  // Mettre endsAt a maintenant pour forcer la resolution
  await prisma.$executeRaw`
    UPDATE "WarnVote" SET "endsAt" = NOW() WHERE id = ${warnId} AND status = 'voting'
  `;

  // Resoudre immediatement
  await resolveExpiredWarns();
  
  return { success: true };
}

export async function skipRevolutionTimer(): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  // Verifier qu'une revolution est en cours
  const rev = await prisma.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT id, status FROM "Revolution" WHERE status = 'voting' LIMIT 1
  `;

  if (!rev[0]) {
    return { success: false, error: "pas de revolution active" };
  }

  // Mettre endsAt a maintenant pour forcer la resolution
  await prisma.$executeRaw`
    UPDATE "Revolution" SET "endsAt" = NOW() WHERE status = 'voting'
  `;

  // Resoudre immediatement
  await resolveExpiredRevolutions();
  
  return { success: true };
}
