import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@antibank/db";

export async function GET() {
  const session = await auth();
  
  if (!session?.user?.id) {
    return NextResponse.json({ balance: "0" });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { balance: true },
  });

  return NextResponse.json({ 
    balance: user?.balance.toString() || "0" 
  });
}
