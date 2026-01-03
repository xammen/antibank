"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@antibank/db";
import { UPGRADES, getPriceForLevel } from "@/lib/upgrades";
import { Decimal } from "@prisma/client/runtime/library";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

export interface BuyResult {
  success: boolean;
  error?: string;
  newBalance?: number;
  newLevel?: number;
}

export async function buyUpgrade(upgradeId: string): Promise<BuyResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Non connecté" };
  }

  const upgrade = UPGRADES[upgradeId];
  if (!upgrade) {
    return { success: false, error: "Upgrade invalide" };
  }

  // Transaction atomique
  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Get user avec ses upgrades
      const user = await tx.user.findUnique({
        where: { id: session.user.id },
        include: { upgrades: true },
      });

      if (!user) {
        throw new Error("User introuvable");
      }

      // Trouver l'upgrade existant ou créer
      const existingUpgrade = user.upgrades.find(
        (u) => u.upgradeId === upgradeId
      );
      const currentLevel = existingUpgrade?.level || 0;

      // Vérifier max level
      if (currentLevel >= upgrade.maxLevel) {
        throw new Error("Niveau max atteint");
      }

      // Calculer le prix
      const price = getPriceForLevel(upgrade.basePrice, currentLevel);

      // Vérifier le solde
      const balance = Number(user.balance);
      if (balance < price) {
        throw new Error(`Pas assez de thunes (${price}€ requis)`);
      }

      // Déduire le montant
      const newBalance = new Decimal(balance - price);

      await tx.user.update({
        where: { id: user.id },
        data: { balance: newBalance },
      });

      // Créer ou update l'upgrade
      const newLevel = currentLevel + 1;

      if (existingUpgrade) {
        await tx.userUpgrade.update({
          where: { id: existingUpgrade.id },
          data: { level: newLevel },
        });
      } else {
        await tx.userUpgrade.create({
          data: {
            userId: user.id,
            upgradeId: upgradeId,
            level: 1,
          },
        });
      }

      // Logger la transaction
      await tx.transaction.create({
        data: {
          userId: user.id,
          type: "shop",
          amount: new Decimal(-price),
          description: `Achat: ${upgrade.name} (niveau ${newLevel})`,
        },
      });

      return {
        newBalance: Number(newBalance),
        newLevel,
      };
    });

    revalidatePath("/shop");
    revalidatePath("/dashboard");

    return {
      success: true,
      newBalance: result.newBalance,
      newLevel: result.newLevel,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return { success: false, error: message };
  }
}
