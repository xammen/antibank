import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClickBattleArenaClient } from "./arena-client";

export default async function ClickBattlePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  return (
    <ClickBattleArenaClient 
      userId={session.user.id} 
      userBalance={session.user.balance}
      userName={session.user.name || "anon"}
    />
  );
}
