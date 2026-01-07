"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@antibank/db";
import { UPGRADES, getPriceForLevel } from "@/lib/upgrades";

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
    const result = await prisma.$transaction(async (tx) => {
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
        (u: { upgradeId: string; level: number }) => u.upgradeId === upgradeId
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
      const newBalance = balance - price;

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
          amount: -price,
          description: `Achat: ${upgrade.name} (niveau ${newLevel})`,
        },
      });

      return {
        newBalance: Number(newBalance),
        newLevel,
      };
    });

    // Pas de revalidatePath - l'UI se met à jour via l'état local optimiste

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
