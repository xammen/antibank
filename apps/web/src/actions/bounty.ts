"use server";

import { prisma, Prisma } from "@antibank/db";
import { auth } from "@/lib/auth";

// Config bounty
const BOUNTY_DURATION_MS = 48 * 60 * 60 * 1000; // 48h
const BOUNTY_MIN_AMOUNT = 1; // 1 euro minimum
const REFUND_FEE_PERCENT = 10; // 10% de frais si expire

interface BountyResult {
  success: boolean;
  error?: string;
  bounty?: {
    id: string;
    amount: number;
    targetName: string;
    expiresAt: Date;
  };
}

interface ActiveBounty {
  id: string;
  targetId: string;
  targetName: string;
  posterId: string;
  posterName: string;
  amount: number;
  expiresAt: Date;
  createdAt: Date;
}

export async function getActiveBounties(): Promise<{ success: boolean; bounties?: ActiveBounty[]; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  const bounties = await prisma.$queryRaw<Array<{
    id: string;
    targetId: string;
    targetName: string;
    posterId: string;
    posterName: string;
    amount: string;
    expiresAt: Date;
    createdAt: Date;
  }>>`
    SELECT b.id, b."targetId", target."discordUsername" as "targetName",
           b."posterId", poster."discordUsername" as "posterName",
           b.amount::text, b."expiresAt", b."createdAt"
    FROM "Bounty" b
    JOIN "User" target ON b."targetId" = target.id
    JOIN "User" poster ON b."posterId" = poster.id
    WHERE b.status = 'active' AND b."expiresAt" > NOW()
    ORDER BY b.amount DESC
  `;

  return {
    success: true,
    bounties: bounties.map(b => ({
      id: b.id,
      targetId: b.targetId,
      targetName: b.targetName,
      posterId: b.posterId,
      posterName: b.posterName,
      amount: parseFloat(b.amount),
      expiresAt: b.expiresAt,
      createdAt: b.createdAt
    }))
  };
}

export async function getMyBounties(): Promise<{ 
  success: boolean; 
  posted?: ActiveBounty[]; 
  onMe?: ActiveBounty[];
  error?: string 
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  const bounties = await prisma.$queryRaw<Array<{
    id: string;
    targetId: string;
    targetName: string;
    posterId: string;
    posterName: string;
    amount: string;
    expiresAt: Date;
    createdAt: Date;
  }>>`
    SELECT b.id, b."targetId", target."discordUsername" as "targetName",
           b."posterId", poster."discordUsername" as "posterName",
           b.amount::text, b."expiresAt", b."createdAt"
    FROM "Bounty" b
    JOIN "User" target ON b."targetId" = target.id
    JOIN "User" poster ON b."posterId" = poster.id
    WHERE b.status = 'active' AND b."expiresAt" > NOW()
      AND (b."posterId" = ${session.user.id} OR b."targetId" = ${session.user.id})
    ORDER BY b."createdAt" DESC
  `;

  const posted: ActiveBounty[] = [];
  const onMe: ActiveBounty[] = [];

  for (const b of bounties) {
    const bounty: ActiveBounty = {
      id: b.id,
      targetId: b.targetId,
      targetName: b.targetName,
      posterId: b.posterId,
      posterName: b.posterName,
      amount: parseFloat(b.amount),
      expiresAt: b.expiresAt,
      createdAt: b.createdAt
    };

    if (b.posterId === session.user.id) {
      posted.push(bounty);
    }
    if (b.targetId === session.user.id) {
      onMe.push(bounty);
    }
  }

  return { success: true, posted, onMe };
}

export async function createBounty(targetId: string, amount: number): Promise<BountyResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  if (session.user.id === targetId) {
    return { success: false, error: "tu peux pas mettre une prime sur toi-meme" };
  }

  if (amount < BOUNTY_MIN_AMOUNT) {
    return { success: false, error: `minimum ${BOUNTY_MIN_AMOUNT} euro` };
  }

  // Verifier les balances
  const users = await prisma.$queryRaw<Array<{
    id: string;
    balance: string;
    discordUsername: string;
    isBanned: boolean;
  }>>`
    SELECT id, balance::text, "discordUsername", "isBanned"
    FROM "User"
    WHERE id IN (${session.user.id}, ${targetId})
  `;

  const poster = users.find(u => u.id === session.user.id);
  const target = users.find(u => u.id === targetId);

  if (!poster || !target) {
    return { success: false, error: "utilisateur introuvable" };
  }

  if (target.isBanned) {
    return { success: false, error: "cette cible est bannie" };
  }

  const posterBalance = parseFloat(poster.balance);

  if (posterBalance < amount) {
    return { success: false, error: "pas assez de thunes" };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + BOUNTY_DURATION_MS);
  const bountyId = `bounty_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // Retirer l'argent et creer la bounty
  await prisma.$executeRaw`
    UPDATE "User" SET balance = balance - ${amount} WHERE id = ${session.user.id}
  `;

  await prisma.$executeRaw`
    INSERT INTO "Bounty" (id, "posterId", "targetId", amount, status, "expiresAt", "createdAt")
    VALUES (${bountyId}, ${session.user.id}, ${targetId}, ${amount}, 'active', ${expiresAt}, ${now})
  `;

  await prisma.transaction.create({
    data: {
      userId: session.user.id,
      type: "bounty_post",
      amount: new Prisma.Decimal(-amount),
      description: `prime sur ${target.discordUsername}`
    }
  });

  return {
    success: true,
    bounty: {
      id: bountyId,
      amount,
      targetName: target.discordUsername,
      expiresAt
    }
  };
}

export async function cancelBounty(bountyId: string): Promise<{ success: boolean; refund?: number; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  // Verifier que la bounty existe et appartient a l'utilisateur
  const bounties = await prisma.$queryRaw<Array<{
    id: string;
    posterId: string;
    amount: string;
    status: string;
  }>>`
    SELECT id, "posterId", amount::text, status
    FROM "Bounty"
    WHERE id = ${bountyId}
  `;

  const bounty = bounties[0];
  if (!bounty) {
    return { success: false, error: "prime introuvable" };
  }

  if (bounty.posterId !== session.user.id) {
    return { success: false, error: "c'est pas ta prime" };
  }

  if (bounty.status !== "active") {
    return { success: false, error: "prime deja terminee" };
  }

  const amount = parseFloat(bounty.amount);
  const fee = Math.floor(amount * REFUND_FEE_PERCENT) / 100;
  const refund = amount - fee;

  // Annuler et rembourser (moins les frais)
  await prisma.$executeRaw`
    UPDATE "Bounty" SET status = 'cancelled' WHERE id = ${bountyId}
  `;

  await prisma.$executeRaw`
    UPDATE "User" SET balance = balance + ${refund} WHERE id = ${session.user.id}
  `;

  await prisma.transaction.create({
    data: {
      userId: session.user.id,
      type: "bounty_refund",
      amount: new Prisma.Decimal(refund),
      description: `prime annulee (${fee.toFixed(2)} de frais)`
    }
  });

  return { success: true, refund };
}

// Fonction pour expirer les bounties (a appeler periodiquement)
export async function expireBounties(): Promise<{ expired: number }> {
  const now = new Date();

  // Trouver les bounties expirees
  const expiredBounties = await prisma.$queryRaw<Array<{
    id: string;
    posterId: string;
    amount: string;
  }>>`
    SELECT id, "posterId", amount::text
    FROM "Bounty"
    WHERE status = 'active' AND "expiresAt" <= ${now}
  `;

  let expired = 0;

  for (const bounty of expiredBounties) {
    const amount = parseFloat(bounty.amount);
    const fee = Math.floor(amount * REFUND_FEE_PERCENT) / 100;
    const refund = amount - fee;

    await prisma.$executeRaw`
      UPDATE "Bounty" SET status = 'expired' WHERE id = ${bounty.id}
    `;

    await prisma.$executeRaw`
      UPDATE "User" SET balance = balance + ${refund} WHERE id = ${bounty.posterId}
    `;

    await prisma.transaction.create({
      data: {
        userId: bounty.posterId,
        type: "bounty_expired",
        amount: new Prisma.Decimal(refund),
        description: `prime expiree (${fee.toFixed(2)} de frais)`
      }
    });

    expired++;
  }

  return { expired };
}

export async function getBountyTargets(): Promise<{ 
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
    ORDER BY balance DESC
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
