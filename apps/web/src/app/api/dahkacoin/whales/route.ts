import { getWhaleLeaderboard } from "@/actions/dahkacoin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const whales = await getWhaleLeaderboard(10);
    return NextResponse.json({
      whales: whales.map((w) => ({
        username: w.username,
        dcBalance: w.dcBalance,
        euroValue: w.euroValue,
        profitPercent: w.profitPercent,
      })),
    });
  } catch {
    return NextResponse.json({ whales: [] }, { status: 500 });
  }
}
