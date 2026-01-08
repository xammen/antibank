import { auth } from "@/lib/auth";
import { DiceGameClient } from "./client";

export default async function DicePage() {
  const session = await auth();

  return (
    <DiceGameClient 
      userBalance={session!.user.balance} 
      userName={session!.user.name || "anon"} 
    />
  );
}
