import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@antibank/db";

const MAX_CLICKS_PER_DAY = 5000;

export async function GET() {
  const session = await auth();
  
  if (!session?.user?.id) {
    return NextResponse.json({ remaining: 0 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { clicksToday: true, lastClickReset: true },
  });

  if (!user) {
    return NextResponse.json({ remaining: MAX_CLICKS_PER_DAY });
  }

  // Check if we need to reset
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastReset = new Date(user.lastClickReset);
  lastReset.setHours(0, 0, 0, 0);

  const clicksToday = today > lastReset ? 0 : user.clicksToday;
  const remaining = MAX_CLICKS_PER_DAY - clicksToday;

  return NextResponse.json({ remaining, total: MAX_CLICKS_PER_DAY });
}
