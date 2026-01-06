"use server";

import { auth } from "@/lib/auth";
import { prisma, Prisma } from "@antibank/db";
import { revalidatePath } from "next/cache";

const TICKET_PRICE = 1;
const BASE_JACKPOT = 20;

export interface BuyTicketResult {
  success: boolean;
  error?: string;
  ticketId?: string;
  jackpot?: number;
}

/**
 * Récupère ou crée la loterie active
 */
async function getOrCreateActiveLottery() {
  // Chercher une loterie ouverte
  let lottery = await prisma.lottery.findFirst({
    where: { status: "open" },
    include: { tickets: true },
  });

  if (!lottery) {
    // Créer une nouvelle loterie (tirage dans 7 jours)
    const drawAt = new Date();
    drawAt.setDate(drawAt.getDate() + 7);
    drawAt.setHours(20, 0, 0, 0); // 20h00

    lottery = await prisma.lottery.create({
      data: {
        jackpot: new Prisma.Decimal(BASE_JACKPOT),
        status: "open",
        drawAt,
      },
      include: { tickets: true },
    });
  }

  return lottery;
}

/**
 * Achète un ticket de loterie
 */
export async function buyLotteryTicket(): Promise<BuyTicketResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté" };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (!user) {
    return { success: false, error: "utilisateur introuvable" };
  }

  if (Number(user.balance) < TICKET_PRICE) {
    return { success: false, error: `il te faut ${TICKET_PRICE}€` };
  }

  try {
    const lottery = await getOrCreateActiveLottery();

    // Vérifier si l'utilisateur a déjà un ticket
    const existingTicket = lottery.tickets.find(t => t.userId === session.user.id);
    if (existingTicket) {
      return { success: false, error: "tu as déjà un ticket" };
    }

    const [ticket] = await prisma.$transaction([
      prisma.lotteryTicket.create({
        data: {
          lotteryId: lottery.id,
          userId: session.user.id,
        },
      }),
      prisma.user.update({
        where: { id: session.user.id },
        data: { balance: { decrement: new Prisma.Decimal(TICKET_PRICE) } },
      }),
      prisma.lottery.update({
        where: { id: lottery.id },
        data: { jackpot: { increment: new Prisma.Decimal(TICKET_PRICE) } },
      }),
      prisma.transaction.create({
        data: {
          userId: session.user.id,
          type: "casino_lottery",
          amount: new Prisma.Decimal(-TICKET_PRICE),
          description: "Ticket de loterie",
        },
      }),
    ]);

    const newJackpot = Number(lottery.jackpot) + TICKET_PRICE;

    revalidatePath("/casino/lottery");
    return {
      success: true,
      ticketId: ticket.id,
      jackpot: newJackpot,
    };
  } catch (error) {
    console.error("Buy lottery ticket error:", error);
    return { success: false, error: "erreur serveur" };
  }
}

/**
 * Récupère les infos de la loterie active
 */
export async function getLotteryInfo() {
  const lottery = await getOrCreateActiveLottery();
  
  return {
    id: lottery.id,
    jackpot: Number(lottery.jackpot),
    drawAt: lottery.drawAt.toISOString(),
    ticketCount: lottery.tickets.length,
  };
}

/**
 * Vérifie si l'utilisateur a un ticket
 */
export async function hasLotteryTicket() {
  const session = await auth();
  if (!session?.user?.id) {
    return false;
  }

  const lottery = await prisma.lottery.findFirst({
    where: { status: "open" },
    include: {
      tickets: {
        where: { userId: session.user.id },
      },
    },
  });

  return lottery?.tickets.length ? true : false;
}

/**
 * Effectue le tirage (à appeler par un cron job)
 */
export async function drawLottery(lotteryId: string) {
  const lottery = await prisma.lottery.findUnique({
    where: { id: lotteryId },
    include: { tickets: true },
  });

  if (!lottery || lottery.status !== "open") {
    return { success: false, error: "loterie invalide" };
  }

  if (lottery.tickets.length === 0) {
    // Pas de participants, reporter
    const newDrawAt = new Date();
    newDrawAt.setDate(newDrawAt.getDate() + 7);
    
    await prisma.lottery.update({
      where: { id: lotteryId },
      data: { drawAt: newDrawAt },
    });
    
    return { success: true, noParticipants: true };
  }

  // Tirer au sort un gagnant
  const winnerIndex = Math.floor(Math.random() * lottery.tickets.length);
  const winnerTicket = lottery.tickets[winnerIndex];
  const prize = Number(lottery.jackpot);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: winnerTicket.userId },
      data: { balance: { increment: new Prisma.Decimal(prize) } },
    }),
    prisma.lottery.update({
      where: { id: lotteryId },
      data: {
        status: "completed",
        winnerId: winnerTicket.userId,
        winnerPrize: new Prisma.Decimal(prize),
        completedAt: new Date(),
      },
    }),
    prisma.transaction.create({
      data: {
        userId: winnerTicket.userId,
        type: "casino_lottery_win",
        amount: new Prisma.Decimal(prize),
        description: `Loterie gagnée! ${prize}€`,
      },
    }),
  ]);

  return {
    success: true,
    winnerId: winnerTicket.userId,
    prize,
  };
}
