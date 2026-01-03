import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@antibank/db";

const VOCAL_BASE_RATE = 0.05;
const VOCAL_BONUS_RATE = 0.02;

export async function GET() {
  const session = await auth();
  
  if (!session?.user?.discordId) {
    return NextResponse.json({ inVoice: false });
  }

  const voiceSession = await prisma.voiceSession.findUnique({
    where: { discordId: session.user.discordId },
  });

  if (!voiceSession) {
    return NextResponse.json({ inVoice: false });
  }

  const othersCount = voiceSession.othersCount;
  const earningsPerMin = VOCAL_BASE_RATE + (VOCAL_BONUS_RATE * Math.max(0, othersCount - 1));

  return NextResponse.json({
    inVoice: true,
    channelName: voiceSession.channelName,
    othersCount: othersCount,
    earningsPerMin: earningsPerMin.toFixed(2),
  });
}
