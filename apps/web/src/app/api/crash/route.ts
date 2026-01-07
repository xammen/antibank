import { getCrashManager } from "@/lib/crash-manager";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET: Récupère l'état actuel du jeu + historique
export async function GET() {
  try {
    const manager = getCrashManager();
    const state = await manager.getPublicState();
    
    return NextResponse.json(state);
  } catch (error) {
    console.error("Crash API error:", error);
    return NextResponse.json(
      { 
        error: "erreur serveur", 
        state: "waiting", 
        currentMultiplier: 1, 
        countdown: 15, 
        players: [],
        skipVotes: 0,
        skipVotesNeeded: 2,
        history: [],
      },
      { status: 500 }
    );
  }
}
