import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DiceGameClient } from "./client";

export default async function DicePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  return (
    <DiceGameClient 
      userBalance={session.user.balance} 
      userName={session.user.name || "anon"} 
    />
  );
}
