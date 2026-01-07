import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@antibank/db";
import { ShopGrid } from "@/components/shop-grid";
import { Balance } from "@/components/balance";
import Link from "next/link";

export default async function ShopPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  // Récupérer les upgrades du user
  const userUpgrades = await prisma.userUpgrade.findMany({
    where: { userId: session.user.id },
  });

  const upgradeMap = userUpgrades.reduce(
    (acc, u) => {
      acc[u.upgradeId] = u.level;
      return acc;
    },
    {} as Record<string, number>
  );

  // Récupérer l'inventaire du user
  const userInventory = await prisma.inventoryItem.findMany({
    where: {
      userId: session.user.id,
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
  });

  return (
    <main className="min-h-screen flex flex-col items-center pt-[10vh] px-6 pb-20">
      <div className="max-w-[600px] w-full flex flex-col gap-8 animate-fade-in">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-[var(--line)] pb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-sm"
            >
              &larr; retour
            </Link>
          </div>
          <h1 className="text-[0.85rem] uppercase tracking-widest">shop</h1>
        </header>

        {/* Balance */}
        <div className="flex justify-center">
          <Balance initialBalance={session.user.balance} />
        </div>

        {/* Shop Grid */}
        <ShopGrid
          userUpgrades={upgradeMap}
          userInventory={userInventory}
          userBalance={parseFloat(session.user.balance) || 0}
        />
      </div>
    </main>
  );
}
