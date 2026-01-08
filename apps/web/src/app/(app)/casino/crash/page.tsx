import { auth } from "@/lib/auth";
import { CrashGameClient } from "./client";

export default async function CrashPage() {
  const session = await auth();

  return (
    <CrashGameClient 
      userId={session!.user.id} 
      userBalance={session!.user.balance}
      userName={session!.user.name || "anon"}
    />
  );
}
