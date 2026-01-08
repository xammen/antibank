import { auth } from "@/lib/auth";
import { ArenaClient } from "./client";

export default async function ArenaPage() {
  const session = await auth();

  return (
    <ArenaClient 
      userId={session!.user.id}
      userBalance={session!.user.balance} 
      userName={session!.user.name || "anon"} 
    />
  );
}
