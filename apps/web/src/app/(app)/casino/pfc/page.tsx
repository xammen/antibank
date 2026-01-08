import { auth } from "@/lib/auth";
import { PFCGameClient } from "./client";

export default async function PFCPage() {
  const session = await auth();

  return (
    <PFCGameClient 
      userBalance={session!.user.balance} 
      userName={session!.user.name || "anon"} 
    />
  );
}
