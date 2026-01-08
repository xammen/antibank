import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@antibank/db";
import { SettingsClient } from "./client";
import type { ClickerIcon } from "@/components/clicker";

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
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
    <SettingsClient
      user={{
        id: user.id,
        name: user.discordUsername || "anon",
        image: user.discordAvatar || null,
        clickerIcon: (user.clickerIcon || "cookie") as ClickerIcon,
      }}
    />
  );
}
