import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClickBattleClient } from "./client";

export default async function ClickBattlePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  return (
    <ClickBattleClient 
      userId={session.user.id} 
      userBalance={session.user.balance}
      userName={session.user.name || "anon"}
    />
  );
}
