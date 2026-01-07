import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Test sorting
const sorted = await prisma.$queryRawUnsafe(`
  SELECT "discordUsername", balance, balance::text as balance_text
  FROM "User" 
  WHERE "isBanned" = false 
  ORDER BY balance DESC 
  LIMIT 5
`);
console.log('Tri par balance DESC:', JSON.stringify(sorted, null, 2));

await prisma.$disconnect();
