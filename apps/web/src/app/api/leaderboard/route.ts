import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@antibank/db";

export async function GET() {
  const session = await auth();
  
  if (!session?.user?.id) {
    return NextResponse.json({ users: [] });
  }

  const users = await prisma.user.findMany({
    where: { isBanned: false },
    select: { 
      id: true,
      discordUsername: true, 
      balance: true,
    },
    orderBy: { balance: "desc" },
    take: 20,
  });

  return NextResponse.json({ 
    users: users.map(u => ({
      id: u.id,
      name: u.discordUsername,
      balance: u.balance.toString(),
      isMe: u.id === session.user.id,
    }))
  });
}
