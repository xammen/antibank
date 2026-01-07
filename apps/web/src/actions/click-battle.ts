"use server";

import { prisma, Prisma } from "@antibank/db";
import { auth } from "@/lib/auth";
import { addToAntibank } from "@/lib/antibank-corp";

// Config
const BATTLE_DURATION_SECONDS = 10;
const BATTLE_EXPIRY_MS = 5 * 60 * 1000; // 5 min
const MIN_BET = 0.5;
const MAX_BET = 100;
const HOUSE_FEE_PERCENT = 5;

interface BattleResult {
  success: boolean;
  error?: string;
  battle?: {
    id: string;
    amount: number;
    duration: number;
    status: string;
    player1Id: string;
    player2Id?: string;
    expiresAt: Date;
  };
}

// Créer un défi
export async function createClickBattle(targetId: string, amount: number): Promise<BattleResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  if (session.user.id === targetId) {
    return { success: false, error: "tu peux pas te defier toi-meme" };
  }

  if (amount < MIN_BET) {
    return { success: false, error: `mise minimum: ${MIN_BET}€` };
  }

  if (amount > MAX_BET) {
    return { success: false, error: `mise maximum: ${MAX_BET}€` };
  }

  // Vérifier les balances
  const users = await prisma.$queryRaw<Array<{
    id: string;
    balance: string;
    discordUsername: string;
  }>>`
    SELECT id, balance::text, "discordUsername"
    FROM "User"
    WHERE id IN (${session.user.id}, ${targetId})
  `;

  const challenger = users.find(u => u.id === session.user.id);
  const target = users.find(u => u.id === targetId);

  if (!challenger || !target) {
    return { success: false, error: "utilisateur introuvable" };
  }

  if (parseFloat(challenger.balance) < amount) {
    return { success: false, error: "pas assez de thunes" };
  }

  if (parseFloat(target.balance) < amount) {
    return { success: false, error: "la cible n'a pas assez" };
  }

  // Vérifier qu'il n'y a pas déjà un battle en cours entre les deux
  const existingBattle = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "ClickBattle"
    WHERE status IN ('pending', 'accepted', 'playing', 'revealing')
      AND (
        ("player1Id" = ${session.user.id} AND "player2Id" = ${targetId})
        OR ("player1Id" = ${targetId} AND "player2Id" = ${session.user.id})
      )
    LIMIT 1
  `;

  if (existingBattle.length > 0) {
    return { success: false, error: "deja un duel en cours" };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + BATTLE_EXPIRY_MS);
  const battleId = `cb_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // Retirer la mise du challenger
  await prisma.$executeRaw`
    UPDATE "User" SET balance = balance - ${amount} WHERE id = ${session.user.id}
  `;

  // Créer le battle
  await prisma.$executeRaw`
    INSERT INTO "ClickBattle" (id, "player1Id", "player2Id", amount, duration, status, "expiresAt", "createdAt")
    VALUES (${battleId}, ${session.user.id}, ${targetId}, ${amount}, ${BATTLE_DURATION_SECONDS}, 'pending', ${expiresAt}, ${now})
  `;

  await prisma.transaction.create({
    data: {
      userId: session.user.id,
      type: "click_battle_bet",
      amount: new Prisma.Decimal(-amount),
      description: `defi click battle vs ${target.discordUsername}`
    }
  });

  return {
    success: true,
    battle: {
      id: battleId,
      amount,
      duration: BATTLE_DURATION_SECONDS,
      status: "pending",
      player1Id: session.user.id,
      player2Id: targetId,
      expiresAt
    }
  };
}

// Accepter un défi
export async function acceptClickBattle(battleId: string): Promise<BattleResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  const battles = await prisma.$queryRaw<Array<{
    id: string;
    player1Id: string;
    player2Id: string;
    amount: string;
    duration: number;
    status: string;
    expiresAt: Date;
  }>>`
    SELECT id, "player1Id", "player2Id", amount::text, duration, status, "expiresAt"
    FROM "ClickBattle"
    WHERE id = ${battleId}
  `;

  const battle = battles[0];
  if (!battle) {
    return { success: false, error: "duel introuvable" };
  }

  if (battle.player2Id !== session.user.id) {
    return { success: false, error: "c'est pas ton duel" };
  }

  if (battle.status !== "pending") {
    return { success: false, error: "duel deja traite" };
  }

  if (new Date() > battle.expiresAt) {
    return { success: false, error: "duel expire" };
  }

  const amount = parseFloat(battle.amount);

  // Vérifier la balance
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { balance: true }
  });

  if (!user || Number(user.balance) < amount) {
    return { success: false, error: "pas assez de thunes" };
  }

  const now = new Date();

  // Retirer la mise et mettre à jour le status
  await prisma.$executeRaw`
    UPDATE "User" SET balance = balance - ${amount} WHERE id = ${session.user.id}
  `;

  await prisma.$executeRaw`
    UPDATE "ClickBattle" SET status = 'accepted', "acceptedAt" = ${now} WHERE id = ${battleId}
  `;

  await prisma.transaction.create({
    data: {
      userId: session.user.id,
      type: "click_battle_bet",
      amount: new Prisma.Decimal(-amount),
      description: `accepte click battle`
    }
  });

  return {
    success: true,
    battle: {
      id: battle.id,
      amount,
      duration: battle.duration,
      status: "accepted",
      player1Id: battle.player1Id,
      player2Id: battle.player2Id,
      expiresAt: battle.expiresAt
    }
  };
}

// Marquer un joueur comme prêt et démarrer quand les deux sont prêts
export async function startClickBattle(battleId: string): Promise<{ 
  success: boolean; 
  error?: string; 
  startTime?: number;
  waiting?: boolean;
  player1Ready?: boolean;
  player2Ready?: boolean;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  const battles = await prisma.$queryRaw<Array<{
    id: string;
    player1Id: string;
    player2Id: string;
    status: string;
    startedAt: Date | null;
    player1Ready: boolean;
    player2Ready: boolean;
  }>>`
    SELECT id, "player1Id", "player2Id", status, "startedAt", 
           COALESCE("player1Ready", false) as "player1Ready",
           COALESCE("player2Ready", false) as "player2Ready"
    FROM "ClickBattle"
    WHERE id = ${battleId}
  `;

  const battle = battles[0];
  if (!battle) {
    return { success: false, error: "duel introuvable" };
  }

  if (battle.player1Id !== session.user.id && battle.player2Id !== session.user.id) {
    return { success: false, error: "t'es pas dans ce duel" };
  }

  if (battle.status !== "accepted") {
    // Si déjà en playing, retourner le startTime
    if (battle.status === "playing" && battle.startedAt) {
      return { success: true, startTime: battle.startedAt.getTime() };
    }
    return { success: false, error: "duel pas encore accepte" };
  }

  // Si déjà démarré, retourner le startTime
  if (battle.startedAt) {
    return { success: true, startTime: battle.startedAt.getTime() };
  }

  const isPlayer1 = battle.player1Id === session.user.id;

  // Marquer ce joueur comme prêt ET relire les valeurs en une seule requête
  // Utilise RETURNING pour éviter la race condition
  let updatedBattles: Array<{
    player1Ready: boolean;
    player2Ready: boolean;
    startedAt: Date | null;
  }>;
  
  if (isPlayer1) {
    updatedBattles = await prisma.$queryRaw`
      UPDATE "ClickBattle" 
      SET "player1Ready" = true
      WHERE id = ${battleId}
      RETURNING 
        COALESCE("player1Ready", false) as "player1Ready",
        COALESCE("player2Ready", false) as "player2Ready",
        "startedAt"
    `;
  } else {
    updatedBattles = await prisma.$queryRaw`
      UPDATE "ClickBattle" 
      SET "player2Ready" = true
      WHERE id = ${battleId}
      RETURNING 
        COALESCE("player1Ready", false) as "player1Ready",
        COALESCE("player2Ready", false) as "player2Ready",
        "startedAt"
    `;
  }

  const updated = updatedBattles[0];
  if (!updated) {
    return { success: false, error: "erreur mise a jour" };
  }

  // Si quelqu'un d'autre a déjà démarré entre temps
  if (updated.startedAt) {
    return { success: true, startTime: updated.startedAt.getTime() };
  }

  // Vérifier si les deux sont maintenant prêts (valeurs fraîches!)
  if (updated.player1Ready && updated.player2Ready) {
    // Les deux sont prêts - démarrer dans 3 secondes (countdown sync)
    const countdownStart = new Date(Date.now() + 3000); // +3s pour le countdown
    
    // Utilise une condition pour éviter les doubles démarrages
    const startResult = await prisma.$queryRaw<Array<{ startedAt: Date | null }>>`
      UPDATE "ClickBattle" 
      SET status = 'playing', "startedAt" = ${countdownStart} 
      WHERE id = ${battleId} AND "startedAt" IS NULL
      RETURNING "startedAt"
    `;
    
    // Si on a réussi à démarrer (startedAt retourné)
    if (startResult.length > 0 && startResult[0].startedAt) {
      return { 
        success: true, 
        startTime: startResult[0].startedAt.getTime(),
        player1Ready: true,
        player2Ready: true
      };
    }
    
    // Sinon quelqu'un d'autre a démarré, relire le startedAt
    const finalBattle = await prisma.$queryRaw<Array<{ startedAt: Date }>>`
      SELECT "startedAt" FROM "ClickBattle" WHERE id = ${battleId}
    `;
    
    if (finalBattle[0]?.startedAt) {
      return { 
        success: true, 
        startTime: finalBattle[0].startedAt.getTime(),
        player1Ready: true,
        player2Ready: true
      };
    }
  }

  // Attendre l'autre joueur
  return { 
    success: true, 
    waiting: true,
    player1Ready: updated.player1Ready,
    player2Ready: updated.player2Ready
  };
}

// Soumettre les résultats
export async function submitClickBattleResult(battleId: string, clicks: number): Promise<{ 
  success: boolean; 
  error?: string;
  waiting?: boolean;
  result?: {
    myClicks: number;
    opponentClicks: number;
    won: boolean | null; // null = égalité
    profit: number;
  };
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  // Sanitize clicks (anti-cheat basique - le vrai check sera côté serveur avec timing)
  clicks = Math.max(0, Math.floor(clicks));
  
  // Limite raisonnable: max 20 clics/seconde = 200 en 10s (humainement faisable ~15/s)
  const maxPossibleClicks = 200;
  clicks = Math.min(clicks, maxPossibleClicks);

  const battles = await prisma.$queryRaw<Array<{
    id: string;
    player1Id: string;
    player2Id: string;
    amount: string;
    duration: number;
    status: string;
    player1Clicks: number | null;
    player2Clicks: number | null;
    startedAt: Date | null;
  }>>`
    SELECT id, "player1Id", "player2Id", amount::text, duration, status, "player1Clicks", "player2Clicks", "startedAt"
    FROM "ClickBattle"
    WHERE id = ${battleId}
  `;

  const battle = battles[0];
  if (!battle) {
    return { success: false, error: "duel introuvable" };
  }

  const isPlayer1 = battle.player1Id === session.user.id;
  const isPlayer2 = battle.player2Id === session.user.id;

  if (!isPlayer1 && !isPlayer2) {
    return { success: false, error: "t'es pas dans ce duel" };
  }

  if (battle.status !== "playing" && battle.status !== "revealing") {
    return { success: false, error: "duel pas en cours" };
  }

  // Vérifier que le temps est écoulé (avec 2s de grâce pour la latence)
  if (battle.startedAt) {
    const elapsed = Date.now() - battle.startedAt.getTime();
    const minTimeRequired = (battle.duration - 2) * 1000;
    if (elapsed < minTimeRequired) {
      return { success: false, error: "le duel n'est pas termine" };
    }
  }

  // Enregistrer les clics
  const clickField = isPlayer1 ? "player1Clicks" : "player2Clicks";
  const alreadySubmitted = isPlayer1 ? battle.player1Clicks : battle.player2Clicks;

  if (alreadySubmitted !== null) {
    return { success: false, error: "deja soumis" };
  }

  if (isPlayer1) {
    await prisma.$executeRaw`
      UPDATE "ClickBattle" SET "player1Clicks" = ${clicks}, status = 'revealing' WHERE id = ${battleId}
    `;
  } else {
    await prisma.$executeRaw`
      UPDATE "ClickBattle" SET "player2Clicks" = ${clicks}, status = 'revealing' WHERE id = ${battleId}
    `;
  }

  // Vérifier si l'autre a aussi soumis
  const otherClicks = isPlayer1 ? battle.player2Clicks : battle.player1Clicks;
  
  if (otherClicks === null) {
    // Attendre l'autre joueur
    return { success: true, waiting: true };
  }

  // Les deux ont soumis - calculer le résultat
  const myClicks = clicks;
  const opponentClicks = otherClicks;
  const amount = parseFloat(battle.amount);
  const totalPot = amount * 2;
  const houseFee = Math.floor(totalPot * HOUSE_FEE_PERCENT) / 100;
  const winnerPrize = totalPot - houseFee;

  // Envoyer les frais à ANTIBANK CORP
  if (houseFee > 0) {
    addToAntibank(houseFee, "taxe click battle").catch(() => {});
  }

  let winnerId: string | null = null;
  let won: boolean | null = null;

  if (myClicks > opponentClicks) {
    winnerId = session.user.id;
    won = true;
  } else if (myClicks < opponentClicks) {
    winnerId = isPlayer1 ? battle.player2Id : battle.player1Id;
    won = false;
  } else {
    // Égalité - rembourser les deux (moins les frais répartis)
    winnerId = null;
    won = null;
  }

  const now = new Date();

  // Mettre à jour le battle
  await prisma.$executeRaw`
    UPDATE "ClickBattle" 
    SET status = 'completed', 
        "winnerId" = ${winnerId},
        "revealedAt" = ${now},
        "completedAt" = ${now}
    WHERE id = ${battleId}
  `;

  // Distribuer les gains
  let profit = 0;
  
  if (won === true) {
    // Gagnant prend tout (moins les frais)
    await prisma.$executeRaw`
      UPDATE "User" SET balance = balance + ${winnerPrize} WHERE id = ${session.user.id}
    `;
    profit = winnerPrize - amount;

    await prisma.transaction.create({
      data: {
        userId: session.user.id,
        type: "click_battle_win",
        amount: new Prisma.Decimal(profit),
        description: `gagne click battle (${myClicks} vs ${opponentClicks})`
      }
    });
  } else if (won === false) {
    // Perdant ne récupère rien
    const winnerId = isPlayer1 ? battle.player2Id : battle.player1Id;
    await prisma.$executeRaw`
      UPDATE "User" SET balance = balance + ${winnerPrize} WHERE id = ${winnerId}
    `;
    profit = -amount;

    await prisma.transaction.create({
      data: {
        userId: session.user.id,
        type: "click_battle_loss",
        amount: new Prisma.Decimal(-amount),
        description: `perdu click battle (${myClicks} vs ${opponentClicks})`
      }
    });
  } else {
    // Égalité - rembourser moins les frais
    const refund = amount - (houseFee / 2);
    await prisma.$executeRaw`
      UPDATE "User" SET balance = balance + ${refund} WHERE id = ${battle.player1Id}
    `;
    await prisma.$executeRaw`
      UPDATE "User" SET balance = balance + ${refund} WHERE id = ${battle.player2Id}
    `;
    profit = refund - amount;

    await prisma.transaction.create({
      data: {
        userId: session.user.id,
        type: "click_battle_draw",
        amount: new Prisma.Decimal(profit),
        description: `egalite click battle (${myClicks} vs ${opponentClicks})`
      }
    });
  }

  return {
    success: true,
    result: {
      myClicks,
      opponentClicks,
      won,
      profit
    }
  };
}

// Récupérer l'état d'un battle
export async function getClickBattleState(battleId: string): Promise<{
  success: boolean;
  error?: string;
  battle?: {
    id: string;
    player1Id: string;
    player1Name: string;
    player2Id: string;
    player2Name: string;
    amount: number;
    duration: number;
    status: string;
    player1Clicks: number | null;
    player2Clicks: number | null;
    winnerId: string | null;
    startedAt: number | null;
    player1Ready: boolean;
    player2Ready: boolean;
  };
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  const battles = await prisma.$queryRaw<Array<{
    id: string;
    player1Id: string;
    player1Name: string;
    player2Id: string;
    player2Name: string;
    amount: string;
    duration: number;
    status: string;
    player1Clicks: number | null;
    player2Clicks: number | null;
    winnerId: string | null;
    startedAt: Date | null;
    player1Ready: boolean;
    player2Ready: boolean;
  }>>`
    SELECT b.id, b."player1Id", p1."discordUsername" as "player1Name",
           b."player2Id", p2."discordUsername" as "player2Name",
           b.amount::text, b.duration, b.status, b."player1Clicks", b."player2Clicks",
           b."winnerId", b."startedAt",
           COALESCE(b."player1Ready", false) as "player1Ready",
           COALESCE(b."player2Ready", false) as "player2Ready"
    FROM "ClickBattle" b
    JOIN "User" p1 ON b."player1Id" = p1.id
    JOIN "User" p2 ON b."player2Id" = p2.id
    WHERE b.id = ${battleId}
  `;

  const battle = battles[0];
  if (!battle) {
    return { success: false, error: "duel introuvable" };
  }

  // Masquer les clics de l'adversaire si pas encore révélé
  const isPlayer1 = battle.player1Id === session.user.id;
  const isCompleted = battle.status === "completed";

  return {
    success: true,
    battle: {
      ...battle,
      amount: parseFloat(battle.amount),
      startedAt: battle.startedAt?.getTime() || null,
      // Masquer les clics adverses jusqu'à la révélation
      player1Clicks: isCompleted || isPlayer1 ? battle.player1Clicks : (battle.player1Clicks !== null ? -1 : null),
      player2Clicks: isCompleted || !isPlayer1 ? battle.player2Clicks : (battle.player2Clicks !== null ? -1 : null),
    }
  };
}

// Récupérer les défis en attente pour l'utilisateur
export async function getMyPendingBattles(): Promise<{
  success: boolean;
  challenges?: Array<{
    id: string;
    challengerName: string;
    amount: number;
    expiresAt: Date;
  }>;
  myBattles?: Array<{
    id: string;
    opponentName: string;
    amount: number;
    status: string;
    startedAt: number | null;
  }>;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false };
  }

  // Défis reçus en attente
  const pendingChallenges = await prisma.$queryRaw<Array<{
    id: string;
    challengerName: string;
    amount: string;
    expiresAt: Date;
  }>>`
    SELECT b.id, p1."discordUsername" as "challengerName", b.amount::text, b."expiresAt"
    FROM "ClickBattle" b
    JOIN "User" p1 ON b."player1Id" = p1.id
    WHERE b."player2Id" = ${session.user.id}
      AND b.status = 'pending'
      AND b."expiresAt" > NOW()
    ORDER BY b."createdAt" DESC
  `;

  // Mes battles actifs
  const myActiveBattles = await prisma.$queryRaw<Array<{
    id: string;
    opponentId: string;
    opponentName: string;
    amount: string;
    status: string;
    startedAt: Date | null;
    isPlayer1: boolean;
  }>>`
    SELECT b.id, 
           CASE WHEN b."player1Id" = ${session.user.id} THEN b."player2Id" ELSE b."player1Id" END as "opponentId",
           CASE WHEN b."player1Id" = ${session.user.id} THEN p2."discordUsername" ELSE p1."discordUsername" END as "opponentName",
           b.amount::text, b.status, b."startedAt",
           (b."player1Id" = ${session.user.id}) as "isPlayer1"
    FROM "ClickBattle" b
    JOIN "User" p1 ON b."player1Id" = p1.id
    LEFT JOIN "User" p2 ON b."player2Id" = p2.id
    WHERE (b."player1Id" = ${session.user.id} OR b."player2Id" = ${session.user.id})
      AND b.status IN ('accepted', 'playing', 'revealing')
    ORDER BY b."createdAt" DESC
  `;

  return {
    success: true,
    challenges: pendingChallenges.map(c => ({
      ...c,
      amount: parseFloat(c.amount)
    })),
    myBattles: myActiveBattles.map(b => ({
      id: b.id,
      opponentName: b.opponentName,
      amount: parseFloat(b.amount),
      status: b.status,
      startedAt: b.startedAt?.getTime() || null
    }))
  };
}

// Récupérer la liste des joueurs pour défier
export async function getClickBattleTargets(): Promise<{
  success: boolean;
  targets?: Array<{ id: string; discordUsername: string; balance: number }>;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false };
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
      AND balance >= ${MIN_BET}
    ORDER BY balance::numeric DESC
    LIMIT 50
  `;

  return {
    success: true,
    targets: targets.map(t => ({
      ...t,
      balance: parseFloat(t.balance)
    }))
  };
}

// Annuler un défi (seulement le créateur, seulement si pending)
export async function cancelClickBattle(battleId: string): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  const battles = await prisma.$queryRaw<Array<{
    id: string;
    player1Id: string;
    amount: string;
    status: string;
  }>>`
    SELECT id, "player1Id", amount::text, status
    FROM "ClickBattle"
    WHERE id = ${battleId}
  `;

  const battle = battles[0];
  if (!battle) {
    return { success: false, error: "duel introuvable" };
  }

  if (battle.player1Id !== session.user.id) {
    return { success: false, error: "c'est pas ton duel" };
  }

  if (battle.status !== "pending") {
    return { success: false, error: "trop tard pour annuler" };
  }

  const amount = parseFloat(battle.amount);

  // Rembourser et annuler
  await prisma.$executeRaw`
    UPDATE "User" SET balance = balance + ${amount} WHERE id = ${session.user.id}
  `;

  await prisma.$executeRaw`
    UPDATE "ClickBattle" SET status = 'cancelled' WHERE id = ${battleId}
  `;

  return { success: true };
}
