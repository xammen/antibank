import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CrashGameClient } from "./client";

export default async function CrashPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  return (
    <CrashGameClient 
      userId={session.user.id} 
      userBalance={session.user.balance}
      userName={session.user.name || "anon"}
    />
  );
}
