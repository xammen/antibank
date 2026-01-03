import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PFCGameClient } from "./client";

export default async function PFCPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  return (
    <PFCGameClient 
      userBalance={session.user.balance} 
      userName={session.user.name || "anon"} 
    />
  );
}
