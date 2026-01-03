"use client";

import { useState, useTransition } from "react";
import {
  UPGRADES,
  UPGRADE_CATEGORIES,
  getPriceForLevel,
  type UpgradeCategory,
} from "@/lib/upgrades";
import { buyUpgrade } from "@/actions/buy-upgrade";
import { useBalance } from "@/hooks/use-balance";

interface ShopGridProps {
  userUpgrades: Record<string, number>;
  userBalance: number;
}

export function ShopGrid({ userUpgrades, userBalance }: ShopGridProps) {
  const [upgrades, setUpgrades] = useState(userUpgrades);
  const [isPending, startTransition] = useTransition();
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { balance, setBalance, refreshBalance } = useBalance(userBalance.toString());

  const handleBuy = async (upgradeId: string) => {
    setError(null);
    setSuccess(null);
    setBuyingId(upgradeId);

    startTransition(async () => {
      const result = await buyUpgrade(upgradeId);

      if (result.success) {
        // Update local state
        setUpgrades((prev) => ({
          ...prev,
          [upgradeId]: result.newLevel || 1,
        }));

        if (result.newBalance !== undefined) {
          setBalance(result.newBalance.toString());
        }

        const upgrade = UPGRADES[upgradeId];
        setSuccess(`${upgrade.icon} ${upgrade.name} niveau ${result.newLevel}!`);
        
        // Clear success après 2s
        setTimeout(() => setSuccess(null), 2000);
      } else {
        setError(result.error || "Erreur");
        setTimeout(() => setError(null), 3000);
      }

      setBuyingId(null);
    });
  };

  // Grouper par catégorie
  const categories = Object.entries(UPGRADE_CATEGORIES) as [
    UpgradeCategory,
    (typeof UPGRADE_CATEGORIES)[UpgradeCategory]
  ][];

  const upgradesByCategory = categories.map(([catId, cat]) => ({
    id: catId,
    ...cat,
    upgrades: Object.values(UPGRADES).filter((u) => u.category === catId),
  }));

  return (
    <div className="flex flex-col gap-8">
      {/* Messages */}
      {error && (
        <div className="text-center p-3 border border-red-500/30 bg-red-500/10 text-red-400 text-sm animate-fade-in">
          {error}
        </div>
      )}
      {success && (
        <div className="text-center p-3 border border-green-500/30 bg-green-500/10 text-green-400 text-sm animate-fade-in">
          {success}
        </div>
      )}

      {/* Categories */}
      {upgradesByCategory.map((category) => (
        <section key={category.id} className="flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--line)]">
            <span className="text-lg">{category.icon}</span>
            <div>
              <h2 className="text-sm font-medium">{category.name}</h2>
              <p className="text-[0.7rem] text-[var(--text-muted)]">
                {category.description}
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            {category.upgrades.map((upgrade) => {
              const currentLevel = upgrades[upgrade.id] || 0;
              const isMaxed = currentLevel >= upgrade.maxLevel;
              const price = isMaxed
                ? 0
                : getPriceForLevel(upgrade.basePrice, currentLevel);
              const canAfford = parseFloat(balance) >= price;
              const isBuying = buyingId === upgrade.id;

              return (
                <div
                  key={upgrade.id}
                  className={`
                    flex items-center justify-between p-4 
                    border border-[var(--line)] 
                    bg-[rgba(255,255,255,0.01)]
                    transition-all duration-200
                    ${isMaxed ? "opacity-50" : ""}
                    ${!isMaxed && canAfford ? "hover:border-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.02)]" : ""}
                  `}
                >
                  {/* Left side - Info */}
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{upgrade.icon}</span>
                    <div>
                      <h3 className="text-sm font-medium">{upgrade.name}</h3>
                      <p className="text-[0.7rem] text-[var(--text-muted)]">
                        {upgrade.description}
                      </p>
                    </div>
                  </div>

                  {/* Right side - Level & Buy */}
                  <div className="flex items-center gap-4">
                    {/* Level indicators */}
                    <div className="flex gap-1">
                      {Array.from({ length: upgrade.maxLevel }).map((_, i) => (
                        <div
                          key={i}
                          className={`
                            w-2 h-2 rounded-full transition-colors
                            ${i < currentLevel ? "bg-green-500" : "bg-[var(--line)]"}
                          `}
                        />
                      ))}
                    </div>

                    {/* Buy button */}
                    {isMaxed ? (
                      <span className="text-[0.7rem] text-green-500 uppercase tracking-wider px-3 py-1.5">
                        max
                      </span>
                    ) : (
                      <button
                        onClick={() => handleBuy(upgrade.id)}
                        disabled={!canAfford || isPending}
                        className={`
                          px-3 py-1.5 text-[0.75rem] 
                          border transition-all duration-200
                          ${
                            canAfford && !isPending
                              ? "border-[var(--text-muted)] hover:border-[var(--text)] hover:bg-[rgba(255,255,255,0.05)] cursor-pointer"
                              : "border-[var(--line)] text-[var(--text-muted)] cursor-not-allowed opacity-50"
                          }
                          ${isBuying ? "animate-pulse" : ""}
                        `}
                      >
                        {isBuying ? "..." : `${price}€`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Stats recap */}
      <div className="mt-4 p-4 border border-[var(--line)] bg-[rgba(255,255,255,0.01)]">
        <h3 className="text-[0.7rem] uppercase tracking-widest text-[var(--text-muted)] mb-3">
          tes bonus actifs
        </h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-lg font-mono">
              +{calculateBonus("click", upgrades).toFixed(3)}€
            </p>
            <p className="text-[0.65rem] text-[var(--text-muted)]">par clic</p>
          </div>
          <div>
            <p className="text-lg font-mono">
              +{calculateBonus("passive", upgrades).toFixed(3)}€
            </p>
            <p className="text-[0.65rem] text-[var(--text-muted)]">par min</p>
          </div>
          <div>
            <p className="text-lg font-mono">
              +{calculateBonus("vocal", upgrades).toFixed(3)}€
            </p>
            <p className="text-[0.65rem] text-[var(--text-muted)]">vocal/min</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper pour calculer les bonus
function calculateBonus(
  category: UpgradeCategory,
  userUpgrades: Record<string, number>
): number {
  let bonus = 0;
  for (const [id, level] of Object.entries(userUpgrades)) {
    const upgrade = UPGRADES[id];
    if (upgrade && upgrade.category === category) {
      bonus += upgrade.effect * level;
    }
  }
  return bonus;
}
