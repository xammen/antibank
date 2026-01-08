// Script de migration one-shot pour ajouter les anciens heists ANTIBANK dans la table Robbery
// À exécuter une seule fois: npx tsx src/scripts/migrate-heists.ts

import { prisma } from "@antibank/db";

const ANTIBANK_CORP_ID = "ANTIBANK_CORP";

async function migrateHeists() {
  console.log("Migration des heists ANTIBANK vers la table Robbery...\n");

  // Récupérer toutes les transactions de heist
  const heistTransactions = await prisma.transaction.findMany({
    where: {
      type: { in: ["antibank_heist_win", "antibank_heist_fail"] }
    },
    orderBy: { createdAt: "asc" }
  });

  console.log(`Trouvé ${heistTransactions.length} transactions de heist`);

  if (heistTransactions.length === 0) {
    console.log("Aucun heist à migrer.");
    return;
  }

  let migrated = 0;
  let skipped = 0;

  for (const tx of heistTransactions) {
    // Vérifier si déjà migré (éviter les doublons)
    const existing = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "Robbery" 
      WHERE "robberId" = ${tx.userId} 
        AND "victimId" = ${ANTIBANK_CORP_ID}
        AND "createdAt" = ${tx.createdAt}
    `;

    if (Number(existing[0].count) > 0) {
      skipped++;
      continue;
    }

    const success = tx.type === "antibank_heist_win";
    const amount = Math.abs(Number(tx.amount));

    try {
      await prisma.$executeRaw`
        INSERT INTO "Robbery" (id, "robberId", "victimId", success, amount, "robberBalance", "victimBalance", "rollChance", "rollResult", "createdAt")
        VALUES (
          ${`heist_migrated_${tx.id}`}, 
          ${tx.userId}, 
          ${ANTIBANK_CORP_ID}, 
          ${success}, 
          ${amount}, 
          ${0}, 
          ${0}, 
          ${30}, 
          ${success ? 15 : 85}, 
          ${tx.createdAt}
        )
      `;
      migrated++;
      console.log(`✓ Migré: ${tx.userId} - ${success ? "succès" : "échec"} - ${amount}€`);
    } catch (err) {
      console.error(`✗ Erreur migration tx ${tx.id}:`, err);
    }
  }

  console.log(`\nMigration terminée: ${migrated} migrés, ${skipped} déjà existants`);
}

migrateHeists()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
