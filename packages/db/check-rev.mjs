import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const rev = await prisma.$queryRawUnsafe(`
  SELECT r.id, r.status, r."forVotes", r."againstVotes", r."targetBalance"::text, r."resolvedAt", 
         target."discordUsername" as target_name, target.balance::text as current_balance 
  FROM "Revolution" r 
  JOIN "User" target ON r."targetId" = target.id 
  ORDER BY r."createdAt" DESC LIMIT 3
`);
console.log('Révolutions:', JSON.stringify(rev, null, 2));

const richest = await prisma.$queryRawUnsafe(`
  SELECT id, "discordUsername", balance::text FROM "User" WHERE "isBanned" = false ORDER BY balance DESC LIMIT 5
`);
console.log('\nTop 5:', JSON.stringify(richest, null, 2));

const txs = await prisma.$queryRawUnsafe(`
  SELECT t.type, t.amount::text, t.description, u."discordUsername" 
  FROM "Transaction" t JOIN "User" u ON t."userId" = u.id 
  WHERE t.type LIKE 'revolution%' ORDER BY t."createdAt" DESC LIMIT 10
`);
console.log('\nTransactions revolution:', JSON.stringify(txs, null, 2));

await prisma.$disconnect();
