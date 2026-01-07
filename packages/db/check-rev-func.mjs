import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Simuler getActiveRevolution (partie "pas de revolution active")
const balances = await prisma.$queryRawUnsafe(`
  SELECT balance::text FROM "User" WHERE "isBanned" = false ORDER BY balance ASC
`);
console.log('Balances triées ASC:', balances.map(b => b.balance));

const balanceValues = balances.map(b => parseFloat(b.balance));
const median = balanceValues[Math.floor(balanceValues.length / 2)];
const richest = balanceValues[balanceValues.length - 1];

console.log('\nMedian:', median);
console.log('Richest (from array):', richest);

const richestUser = await prisma.$queryRawUnsafe(`
  SELECT id, "discordUsername", balance::text FROM "User"
  WHERE "isBanned" = false
  ORDER BY balance DESC
  LIMIT 1
`);
console.log('\nRichest user (from query):', richestUser);

const canStart = richest >= median * 3;
console.log('\nCan start revolution:', canStart, '(richest >= median * 3:', richest, '>=', median * 3, ')');

await prisma.$disconnect();
