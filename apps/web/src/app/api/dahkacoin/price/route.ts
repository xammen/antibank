import { getCurrentPrice } from "@/actions/dahkacoin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { price, trend } = await getCurrentPrice();
    return NextResponse.json({ price, trend });
  } catch {
    return NextResponse.json({ price: 0, trend: 0 }, { status: 500 });
  }
}
