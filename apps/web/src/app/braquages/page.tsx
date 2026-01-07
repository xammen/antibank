import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { RobberyClient } from "./client";

export default async function BraquagesPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  return (
    <main className="min-h-screen flex flex-col items-center pt-[10vh] px-6 pb-20">
      <RobberyClient userId={session.user.id} />
    </main>
  );
}
