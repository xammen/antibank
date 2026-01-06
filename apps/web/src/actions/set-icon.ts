"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@antibank/db";

const VALID_ICONS = ["cookie", "cookie-bw", "cookie-cute"] as const;
export type ClickerIcon = typeof VALID_ICONS[number];

export async function setClickerIcon(icon: string): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  
  if (!session?.user?.id) {
    return { success: false, error: "non connecté" };
  }

  if (!VALID_ICONS.includes(icon as ClickerIcon)) {
    return { success: false, error: "icône invalide" };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { clickerIcon: icon },
  });

  return { success: true };
}
