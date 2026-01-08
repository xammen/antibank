import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@antibank/db";
import { SettingsClient } from "./client";
import type { ClickerIcon } from "@/components/clicker";

export default async function SettingsPage() {
  const session = await auth();
  const userId = session!.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      discordUsername: true,
      discordAvatar: true,
      clickerIcon: true,
    },
  });

  if (!user) {
    redirect("/");
  }

  return (
    <main className="min-h-screen flex flex-col items-center pt-[4vh] lg:pt-[6vh] px-6 pb-20 lg:pb-6">
      <SettingsClient
        user={{
          id: user.id,
          name: user.discordUsername || "anon",
          image: user.discordAvatar || null,
          clickerIcon: (user.clickerIcon || "cookie") as ClickerIcon,
        }}
      />
    </main>
  );
}
