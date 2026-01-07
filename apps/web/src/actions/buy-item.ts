"use server";

import { auth } from "@/lib/auth";
import { prisma, ITEMS, Prisma } from "@antibank/db";
import { revalidatePath } from "next/cache";

export interface BuyItemResult {
  success: boolean;
  error?: string;
  newBalance?: number;
  charges?: number;
}

export async function buyItem(itemId: string): Promise<BuyItemResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecte" };
  }

  const item = ITEMS[itemId];
  if (!item) {
    return { success: false, error: "item invalide" };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Get user
      const user = await tx.user.findUnique({
        where: { id: session.user.id },
      });

      if (!user) {
        throw new Error("utilisateur introuvable");
      }

      // Vérifier le solde
      const balance = Number(user.balance);
      if (balance < item.price) {
        throw new Error(`pas assez de thunes (${item.price}€ requis)`);
      }

      // Déduire le montant
      const newBalance = balance - item.price;

      await tx.user.update({
        where: { id: user.id },
        data: { balance: newBalance },
      });

      // Vérifier si l'item existe déjà dans l'inventaire
      const existingItem = await tx.inventoryItem.findFirst({
        where: {
          userId: user.id,
          itemId: itemId,
          // Pour les items avec expiration, on peut stack si pas expiré
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
      });

      let charges: number;

      if (existingItem && item.charges > 0) {
        // Stack les charges
        charges = existingItem.charges + item.charges;
        await tx.inventoryItem.update({
          where: { id: existingItem.id },
          data: { charges },
        });
      } else {
        // Créer un nouvel item
        charges = item.charges;
        await tx.inventoryItem.create({
          data: {
            userId: user.id,
            itemId: itemId,
            charges: item.charges,
            // Pas d'expiration pour les items standards
            expiresAt: null,
          },
        });
      }

      // Logger la transaction
      await tx.transaction.create({
        data: {
          userId: user.id,
          type: "shop",
          amount: new Prisma.Decimal(-item.price),
          description: `achat: ${item.name}`,
        },
      });

      return {
        newBalance,
        charges,
      };
    });

    revalidatePath("/shop");
    revalidatePath("/dashboard");
    revalidatePath("/braquages");

    return {
      success: true,
      newBalance: result.newBalance,
      charges: result.charges,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "erreur inconnue";
    return { success: false, error: message };
  }
}

// Récupérer l'inventaire du user
export async function getUserInventory(): Promise<{
  itemId: string;
  charges: number;
  expiresAt: Date | null;
}[]> {
  const session = await auth();
  if (!session?.user?.id) return [];

  const inventory = await prisma.inventoryItem.findMany({
    where: {
      userId: session.user.id,
      charges: { not: 0 },
    },
    select: {
      itemId: true,
      charges: true,
      expiresAt: true,
    },
  });

  // Filtrer les items expirés
  return inventory.filter(
    (item) => !item.expiresAt || item.expiresAt > new Date()
  );
}
