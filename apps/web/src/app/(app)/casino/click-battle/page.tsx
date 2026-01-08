import { auth } from "@/lib/auth";
import { ClickBattleArenaClient } from "./arena-client";

export default async function ClickBattlePage() {
  const session = await auth();

  return (
    <ClickBattleArenaClient 
      userId={session!.user.id} 
      userBalance={session!.user.balance}
      userName={session!.user.name || "anon"}
    />
  );
}
