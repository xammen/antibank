// ANTIBANK CORP - La maison qui accumule toutes les taxes
// Stocké dans GameConfig avec la clé "antibank_corp_balance"

import { prisma } from "@antibank/db";

export const ANTIBANK_CORP_ID = "ANTIBANK_CORP";
export const ANTIBANK_CORP_NAME = "ANTIBANK CORP";

// Récupérer le solde d'ANTIBANK CORP
export async function getAntibankBalance(): Promise<number> {
  const config = await prisma.gameConfig.findUnique({
    where: { key: "antibank_corp_balance" }
  });
  
  if (!config) {
    // Initialiser à 0
    await prisma.gameConfig.create({
      data: {
        key: "antibank_corp_balance",
        value: { balance: 0 }
      }
    });
    return 0;
  }
  
  return (config.value as { balance: number }).balance || 0;
}

// Ajouter des fonds à ANTIBANK CORP (taxes, pertes, etc.)
export async function addToAntibank(amount: number, reason?: string): Promise<number> {
  if (amount <= 0) return await getAntibankBalance();
  
  // Utiliser une transaction atomique avec raw SQL pour éviter les race conditions
  const result = await prisma.$transaction(async (tx) => {
    // Upsert atomique - si la config n'existe pas, la créer
    await tx.gameConfig.upsert({
      where: { key: "antibank_corp_balance" },
      create: {
        key: "antibank_corp_balance",
        value: { balance: 0 }
      },
      update: {}
    });
    
    // Lire la valeur actuelle
    const config = await tx.gameConfig.findUnique({
      where: { key: "antibank_corp_balance" }
    });
    
    const currentBalance = (config?.value as { balance: number })?.balance || 0;
    const newBalance = Math.round((currentBalance + amount) * 100) / 100;
    
    // Update avec la nouvelle balance
    await tx.gameConfig.update({
      where: { key: "antibank_corp_balance" },
      data: {
        value: { balance: newBalance }
      }
    });
    
    return newBalance;
  });
  
  // Log la transaction hors de la transaction principale (non-bloquant)
  if (reason) {
    prisma.transaction.create({
      data: {
        userId: ANTIBANK_CORP_ID,
        type: "antibank_income",
        amount: amount,
        description: reason
      }
    }).catch(() => {
      // Ignore - le userId système n'existe pas en DB, c'est ok
    });
  }
  
  return result;
}

// Retirer des fonds d'ANTIBANK CORP (braquage réussi)
export async function removeFromAntibank(amount: number): Promise<{ success: boolean; newBalance: number }> {
  const currentBalance = await getAntibankBalance();
  
  if (amount > currentBalance) {
    // On ne peut prendre que ce qu'il y a
    amount = currentBalance;
  }
  
  if (amount <= 0) {
    return { success: false, newBalance: currentBalance };
  }
  
  const newBalance = Math.round((currentBalance - amount) * 100) / 100;
  
  await prisma.gameConfig.update({
    where: { key: "antibank_corp_balance" },
    data: {
      value: { balance: newBalance }
    }
  });
  
  return { success: true, newBalance };
}

// Stats sur ANTIBANK CORP
export async function getAntibankStats(): Promise<{
  balance: number;
  canBeRobbed: boolean;
  robberyRisk: number; // Pourcentage de risque pour le braqueur
  maxSteal: number; // Montant max qu'on peut voler
}> {
  const balance = await getAntibankBalance();
  
  return {
    balance,
    canBeRobbed: balance >= 10, // Minimum 10€ pour être braquable
    robberyRisk: 80, // 80% de chances de perdre si on tente
    maxSteal: Math.floor(balance * 0.05 * 100) / 100, // Max 5% du solde
  };
}
