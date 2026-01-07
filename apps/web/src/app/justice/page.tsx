import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { JusticeClient } from "./client";

export default async function JusticePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  return (
    <main className="min-h-screen flex flex-col items-center pt-[10vh] px-6 pb-20">
      <JusticeClient userId={session.user.id} />
    </main>
  );
}
