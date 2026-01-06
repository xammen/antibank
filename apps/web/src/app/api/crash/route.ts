import { getCrashManager } from "@/lib/crash-manager";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET: Récupère l'état actuel du jeu
export async function GET() {
  const manager = getCrashManager();
  const state = manager.getPublicState();
  
  return NextResponse.json(state);
}
