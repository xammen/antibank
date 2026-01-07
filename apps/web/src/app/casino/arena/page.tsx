import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ArenaClient } from "./client";

export default async function ArenaPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  return (
    <ArenaClient 
      userId={session.user.id}
      userBalance={session.user.balance} 
      userName={session.user.name || "anon"} 
    />
  );
}
