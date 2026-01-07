"use client";

import { useState } from "react";
import {
  UPGRADES,
  UPGRADE_CATEGORIES,
  ITEMS,
  ITEM_CATEGORIES,
  getPriceForLevel,
  type UpgradeCategory,
  type ItemCategory,
} from "@/lib/upgrades";
import { buyUpgrade } from "@/actions/buy-upgrade";
import { buyItem } from "@/actions/buy-item";
import { useBalance } from "@/hooks/use-balance";

interface ShopGridProps {
  userUpgrades: Record<string, number>;
  userInventory: { itemId: string; charges: number }[];
  userBalance: number;
}

export function ShopGrid({ userUpgrades, userInventory, userBalance }: ShopGridProps) {
  const [upgrades, setUpgrades] = useState(userUpgrades);
  const [inventory, setInventory] = useState(userInventory);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { balance, setBalance } = useBalance(userBalance.toString());

  const handleBuy = (upgradeId: string) => {
    const upgrade = UPGRADES[upgradeId];
    const currentLevel = upgrades[upgradeId] || 0;
    const price = getPriceForLevel(upgrade.basePrice, currentLevel);
    
    // OPTIMISTIC: Update immédiatement
    setError(null);
    setSuccess(`${upgrade.icon} ${upgrade.name} niveau ${currentLevel + 1}!`);
    setUpgrades((prev) => ({ ...prev, [upgradeId]: currentLevel + 1 }));
    setBalance((parseFloat(balance) - price).toString());
    setTimeout(() => setSuccess(null), 2000);

    // Fire and forget - serveur confirme en background
    buyUpgrade(upgradeId).then(result => {
      if (!result.success) {
        // Rollback
        setError(result.error || "Erreur");
        setSuccess(null);
        setUpgrades((prev) => ({ ...prev, [upgradeId]: currentLevel }));
        setBalance(userBalance.toString());
        setTimeout(() => setError(null), 3000);
      } else if (result.newBalance !== undefined) {
        // Sync avec le vrai solde serveur
        setBalance(result.newBalance.toString());
      }
    });
  };

  const handleBuyItem = (itemId: string) => {
    const item = ITEMS[itemId];
    
    // OPTIMISTIC: Update immédiatement
    setError(null);
    setSuccess(`${item.icon} ${item.name} achete!`);
    setInventory((prev) => {
      const existing = prev.find((i) => i.itemId === itemId);
      if (existing) {
        return prev.map((i) =>
          i.itemId === itemId ? { ...i, charges: i.charges + item.charges } : i
        );
      }
      return [...prev, { itemId, charges: item.charges }];
    });
    setBalance((parseFloat(balance) - item.price).toString());
    setTimeout(() => setSuccess(null), 2000);

    // Fire and forget
    buyItem(itemId).then(result => {
      if (!result.success) {
        // Rollback
        setError(result.error || "erreur");
        setSuccess(null);
        setInventory(userInventory); // Full rollback
        setBalance(userBalance.toString());
        setTimeout(() => setError(null), 3000);
      } else if (result.newBalance !== undefined) {
        setBalance(result.newBalance.toString());
      }
    });
  };

  // Grouper par catégorie - Upgrades
  const categories = Object.entries(UPGRADE_CATEGORIES) as [
    UpgradeCategory,
    (typeof UPGRADE_CATEGORIES)[UpgradeCategory]
  ][];

  const upgradesByCategory = categories.map(([catId, cat]) => ({
    id: catId,
    ...cat,
    upgrades: Object.values(UPGRADES).filter((u) => u.category === catId),
  }));

  // Grouper par catégorie - Items
  const itemCategories = Object.entries(ITEM_CATEGORIES) as [
    ItemCategory,
    (typeof ITEM_CATEGORIES)[ItemCategory]
  ][];

  const itemsByCategory = itemCategories.map(([catId, cat]) => ({
    id: catId,
    ...cat,
    items: Object.values(ITEMS).filter((i) => i.category === catId),
  }));

  // Helper pour obtenir les charges d'un item
  const getItemCharges = (itemId: string) => {
    const item = inventory.find((i) => i.itemId === itemId);
    return item?.charges || 0;
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Toast messages - fixed position */}
      {(error || success) && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          {error && (
            <div className="px-4 py-2 border border-red-500/30 bg-[#1a1a1a] text-red-400 text-sm shadow-lg">
              {error}
            </div>
          )}
          {success && (
            <div className="px-4 py-2 border border-green-500/30 bg-[#1a1a1a] text-green-400 text-sm shadow-lg">
              {success}
            </div>
          )}
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
                        disabled={!canAfford}
                        className={`
                          px-3 py-1.5 text-[0.75rem] 
                          border transition-all duration-200 active:scale-95
                          ${
                            canAfford
                              ? "border-[var(--text-muted)] hover:border-[var(--text)] hover:bg-[rgba(255,255,255,0.05)] cursor-pointer"
                              : "border-[var(--line)] text-[var(--text-muted)] cursor-not-allowed opacity-50"
                          }
                        `}
                      >
                        {price}€
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Separator */}
      <div className="border-t border-[var(--line)] my-4" />

      {/* Items Section Header */}
      <div className="text-center">
        <h2 className="text-[0.75rem] uppercase tracking-widest text-[var(--text-muted)]">
          items consommables
        </h2>
      </div>

      {/* Item Categories */}
      {itemsByCategory.map((category) => (
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
            {category.items.map((item) => {
              const currentCharges = getItemCharges(item.id);
              const canAfford = parseFloat(balance) >= item.price;

              return (
                <div
                  key={item.id}
                  className={`
                    flex items-center justify-between p-4 
                    border border-[var(--line)] 
                    bg-[rgba(255,255,255,0.01)]
                    transition-all duration-200
                    ${canAfford ? "hover:border-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.02)]" : ""}
                  `}
                >
                  {/* Left side - Info */}
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{item.icon}</span>
                    <div>
                      <h3 className="text-sm font-medium">{item.name}</h3>
                      <p className="text-[0.7rem] text-[var(--text-muted)]">
                        {item.description}
                      </p>
                      {item.charges > 0 && (
                        <p className="text-[0.65rem] text-[var(--text-muted)] mt-1">
                          {item.charges} charge{item.charges > 1 ? "s" : ""} par achat
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right side - Charges & Buy */}
                  <div className="flex items-center gap-4">
                    {/* Current charges */}
                    {currentCharges > 0 && (
                      <span className="text-[0.7rem] text-green-500">
                        x{currentCharges}
                      </span>
                    )}

                    {/* Buy button */}
                    <button
                      onClick={() => handleBuyItem(item.id)}
                      disabled={!canAfford}
                      className={`
                        px-3 py-1.5 text-[0.75rem] 
                        border transition-all duration-200 active:scale-95
                        ${
                          canAfford
                            ? "border-[var(--text-muted)] hover:border-[var(--text)] hover:bg-[rgba(255,255,255,0.05)] cursor-pointer"
                            : "border-[var(--line)] text-[var(--text-muted)] cursor-not-allowed opacity-50"
                        }
                      `}
                    >
                      {item.price}€
                    </button>
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
