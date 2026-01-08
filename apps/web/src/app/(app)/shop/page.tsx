import { auth } from "@/lib/auth";
import { prisma } from "@antibank/db";
import { ShopGrid } from "@/components/shop-grid";

export default async function ShopPage() {
  const session = await auth();
  const userId = session!.user.id;

  // Requêtes en parallèle
  const [userUpgrades, userInventory] = await Promise.all([
    prisma.userUpgrade.findMany({
      where: { userId },
    }),
    prisma.inventoryItem.findMany({
      where: {
        userId,
        charges: { not: 0 },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      select: {
        itemId: true,
        charges: true,
      },
    }),
  ]);

  const upgradeMap = userUpgrades.reduce(
    (acc, u) => {
      acc[u.upgradeId] = u.level;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <main className="min-h-screen flex flex-col items-center pt-[4vh] lg:pt-[6vh] px-6 pb-20 lg:pb-6">
      <div className="max-w-[600px] w-full flex flex-col gap-6 animate-fade-in">
        {/* Header */}
        <header className="flex items-center justify-center border-b border-[var(--line)] pb-4">
          <h1 className="text-[0.85rem] uppercase tracking-widest">shop</h1>
        </header>

        {/* Shop Grid */}
        <ShopGrid
          userUpgrades={upgradeMap}
          userInventory={userInventory}
          userBalance={parseFloat(session!.user.balance) || 0}
        />
      </div>
    </main>
  );
}
