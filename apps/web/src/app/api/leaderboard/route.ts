import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@antibank/db";
import { getAntibankBalance, ANTIBANK_CORP_ID, ANTIBANK_CORP_NAME } from "@/lib/antibank-corp";

export async function GET() {
  const session = await auth();
  
  if (!session?.user?.id) {
    return NextResponse.json({ users: [] });
  }

  const [users, antibankBalance] = await Promise.all([
    prisma.user.findMany({
      where: { isBanned: false },
      select: { 
        id: true,
        discordUsername: true, 
        balance: true,
      },
      orderBy: { balance: "desc" },
      take: 20,
    }),
    getAntibankBalance()
  ]);

  // Créer la liste avec ANTIBANK CORP
  const leaderboardUsers = users.map(u => ({
    id: u.id,
    name: u.discordUsername,
    balance: Number(u.balance),
    isMe: u.id === session.user.id,
    isAntibank: false,
  }));

  // Ajouter ANTIBANK CORP
  leaderboardUsers.push({
    id: ANTIBANK_CORP_ID,
    name: ANTIBANK_CORP_NAME,
    balance: antibankBalance,
    isMe: false,
    isAntibank: true,
  });

  // Trier par balance décroissante
  leaderboardUsers.sort((a, b) => b.balance - a.balance);

  // Limiter à 20
  const topUsers = leaderboardUsers.slice(0, 20);

  return NextResponse.json({ 
    users: topUsers.map(u => ({
      id: u.id,
      name: u.name,
      balance: u.balance.toString(),
      isMe: u.isMe,
      isAntibank: u.isAntibank,
    }))
  });
}
