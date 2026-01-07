import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Test 1: ORDER BY balance (Decimal) with ::text in SELECT
const test1 = await prisma.$queryRawUnsafe(`
  SELECT balance::text FROM "User" WHERE "isBanned" = false ORDER BY balance ASC
`);
console.log('Test 1 - ORDER BY balance (Decimal), SELECT ::text:', test1.map(b => b.balance));

// Test 2: ORDER BY balance::numeric 
const test2 = await prisma.$queryRawUnsafe(`
  SELECT balance::text FROM "User" WHERE "isBanned" = false ORDER BY balance::numeric ASC
`);
console.log('Test 2 - ORDER BY balance::numeric:', test2.map(b => b.balance));

await prisma.$disconnect();
