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
  const [toastVisible, setToastVisible] = useState(false);
  const { balance, setBalance } = useBalance(userBalance.toString());

  const showToast = (type: "success" | "error", message: string) => {
    if (type === "success") {
      setSuccess(message);
      setError(null);
    } else {
      setError(message);
      setSuccess(null);
    }
    setToastVisible(true);
    setTimeout(() => {
      setToastVisible(false);
      setTimeout(() => {
        setSuccess(null);
        setError(null);
      }, 300);
    }, 2000);
  };

  const handleBuy = (upgradeId: string) => {
    const upgrade = UPGRADES[upgradeId];
    const currentLevel = upgrades[upgradeId] || 0;
    const price = getPriceForLevel(upgrade.basePrice, currentLevel);
    
    showToast("success", `${upgrade.icon} ${upgrade.name} niveau ${currentLevel + 1}!`);
    setUpgrades((prev) => ({ ...prev, [upgradeId]: currentLevel + 1 }));
    setBalance((parseFloat(balance) - price).toString());

    buyUpgrade(upgradeId).then(result => {
      if (!result.success) {
        showToast("error", result.error || "erreur");
        setUpgrades((prev) => ({ ...prev, [upgradeId]: currentLevel }));
        setBalance(userBalance.toString());
      } else if (result.newBalance !== undefined) {
        setBalance(result.newBalance.toString());
      }
    });
  };

  const handleBuyItem = (itemId: string) => {
    const item = ITEMS[itemId];
    
    showToast("success", `${item.icon} ${item.name} achete!`);
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

    buyItem(itemId).then(result => {
      if (!result.success) {
        showToast("error", result.error || "erreur");
        setInventory(userInventory);
        setBalance(userBalance.toString());
      } else if (result.newBalance !== undefined) {
        setBalance(result.newBalance.toString());
      }
    });
  };

  const categories = Object.entries(UPGRADE_CATEGORIES) as [
    UpgradeCategory,
    (typeof UPGRADE_CATEGORIES)[UpgradeCategory]
  ][];

  const upgradesByCategory = categories.map(([catId, cat]) => ({
    id: catId,
    ...cat,
    upgrades: Object.values(UPGRADES).filter((u) => u.category === catId),
  }));

  const itemCategories = Object.entries(ITEM_CATEGORIES) as [
    ItemCategory,
    (typeof ITEM_CATEGORIES)[ItemCategory]
  ][];

  const itemsByCategory = itemCategories.map(([catId, cat]) => ({
    id: catId,
    ...cat,
    items: Object.values(ITEMS).filter((i) => i.category === catId),
  }));

  const getItemCharges = (itemId: string) => {
    const item = inventory.find((i) => i.itemId === itemId);
    return item?.charges || 0;
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Toast notification - slide in from top */}
      <div 
        className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
          toastVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"
        }`}
      >
        {error && (
          <div className="px-5 py-3 border border-red-500/50 bg-gradient-to-r from-red-500/10 to-red-600/5 backdrop-blur-sm text-red-400 text-sm shadow-lg shadow-red-500/10 flex items-center gap-2">
            <span className="text-base">✗</span>
            {error}
          </div>
        )}
        {success && (
          <div className="px-5 py-3 border border-green-500/50 bg-gradient-to-r from-green-500/10 to-green-600/5 backdrop-blur-sm text-green-400 text-sm shadow-lg shadow-green-500/10 flex items-center gap-2">
            <span className="text-base">✓</span>
            {success}
          </div>
        )}
      </div>

      {/* Upgrade Categories */}
      {upgradesByCategory.map((category) => (
        <section key={category.id} className="flex flex-col gap-4">
          {/* Category Header */}
          <div className="flex items-center gap-3 pb-3 border-b border-[var(--line)]/50">
            <div className="w-10 h-10 flex items-center justify-center bg-gradient-to-br from-white/5 to-white/0 border border-[var(--line)]/50 rounded-lg">
              <span className="text-xl">{category.icon}</span>
            </div>
            <div>
              <h2 className="text-sm font-medium tracking-wide">{category.name}</h2>
              <p className="text-[0.7rem] text-[var(--text-muted)]">
                {category.description}
              </p>
            </div>
          </div>

          {/* Upgrade Cards */}
          <div className="grid gap-3">
            {category.upgrades.map((upgrade) => {
              const currentLevel = upgrades[upgrade.id] || 0;
              const isMaxed = currentLevel >= upgrade.maxLevel;
              const price = isMaxed ? 0 : getPriceForLevel(upgrade.basePrice, currentLevel);
              const canAfford = parseFloat(balance) >= price;
              const progress = (currentLevel / upgrade.maxLevel) * 100;

              return (
                <div
                  key={upgrade.id}
                  className={`
                    group relative overflow-hidden
                    p-4 border transition-all duration-300
                    ${isMaxed 
                      ? "border-green-500/20 bg-gradient-to-r from-green-500/5 to-transparent" 
                      : canAfford
                        ? "border-[var(--line)]/50 bg-gradient-to-r from-white/[0.02] to-transparent hover:border-[var(--text-muted)]/50 hover:from-white/[0.04] hover:shadow-lg hover:shadow-white/[0.02]"
                        : "border-[var(--line)]/30 bg-[rgba(255,255,255,0.01)] opacity-60"
                    }
                  `}
                >
                  {/* Glow effect on hover */}
                  {!isMaxed && canAfford && (
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                      <div className="absolute top-0 left-0 w-32 h-32 bg-white/[0.03] blur-2xl -translate-x-1/2 -translate-y-1/2" />
                    </div>
                  )}

                  <div className="relative flex items-center justify-between">
                    {/* Left - Icon & Info */}
                    <div className="flex items-center gap-4">
                      <div className={`
                        w-12 h-12 flex items-center justify-center rounded-lg transition-all duration-300
                        ${isMaxed 
                          ? "bg-green-500/10 border border-green-500/30" 
                          : "bg-white/[0.03] border border-[var(--line)]/30 group-hover:border-[var(--line)]/50"
                        }
                      `}>
                        <span className="text-2xl">{upgrade.icon}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <h3 className="text-sm font-medium">{upgrade.name}</h3>
                        <p className="text-[0.7rem] text-[var(--text-muted)] max-w-[200px]">
                          {upgrade.description}
                        </p>
                        {/* Progress bar */}
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-24 h-1.5 bg-[var(--line)]/30 rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-500 rounded-full ${
                                isMaxed ? "bg-green-500" : "bg-gradient-to-r from-[var(--text-muted)] to-[var(--text)]"
                              }`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-[0.6rem] text-[var(--text-muted)] font-mono">
                            {currentLevel}/{upgrade.maxLevel}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right - Buy Button */}
                    <div className="flex items-center gap-3">
                      {isMaxed ? (
                        <div className="px-4 py-2 border border-green-500/30 bg-green-500/10 text-green-400 text-[0.75rem] uppercase tracking-wider">
                          max
                        </div>
                      ) : (
                        <button
                          onClick={() => handleBuy(upgrade.id)}
                          disabled={!canAfford}
                          className={`
                            relative px-4 py-2 text-[0.8rem] font-mono
                            border transition-all duration-200 
                            active:scale-95 overflow-hidden
                            ${canAfford
                              ? "border-[var(--text-muted)] hover:border-green-500/50 hover:text-green-400 hover:shadow-lg hover:shadow-green-500/10 cursor-pointer group/btn"
                              : "border-[var(--line)]/50 text-[var(--text-muted)] cursor-not-allowed"
                            }
                          `}
                        >
                          {canAfford && (
                            <div className="absolute inset-0 bg-gradient-to-r from-green-500/0 via-green-500/10 to-green-500/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-500" />
                          )}
                          <span className="relative">{price.toFixed(0)}€</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Items Section Divider */}
      <div className="relative py-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[var(--line)]/30" />
        </div>
        <div className="relative flex justify-center">
          <span className="px-4 bg-[var(--bg)] text-[0.7rem] uppercase tracking-widest text-[var(--text-muted)]">
            items consommables
          </span>
        </div>
      </div>

      {/* Item Categories */}
      {itemsByCategory.map((category) => (
        <section key={category.id} className="flex flex-col gap-4">
          {/* Category Header */}
          <div className="flex items-center gap-3 pb-3 border-b border-[var(--line)]/50">
            <div className="w-10 h-10 flex items-center justify-center bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 rounded-lg">
              <span className="text-xl">{category.icon}</span>
            </div>
            <div>
              <h2 className="text-sm font-medium tracking-wide">{category.name}</h2>
              <p className="text-[0.7rem] text-[var(--text-muted)]">
                {category.description}
              </p>
            </div>
          </div>

          {/* Item Cards */}
          <div className="grid gap-3">
            {category.items.map((item) => {
              const currentCharges = getItemCharges(item.id);
              const canAfford = parseFloat(balance) >= item.price;

              return (
                <div
                  key={item.id}
                  className={`
                    group relative overflow-hidden
                    p-4 border transition-all duration-300
                    ${canAfford
                      ? "border-[var(--line)]/50 bg-gradient-to-r from-amber-500/[0.02] to-transparent hover:border-amber-500/30 hover:from-amber-500/[0.05] hover:shadow-lg hover:shadow-amber-500/[0.05]"
                      : "border-[var(--line)]/30 bg-[rgba(255,255,255,0.01)] opacity-60"
                    }
                  `}
                >
                  <div className="relative flex items-center justify-between">
                    {/* Left - Icon & Info */}
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className={`
                          w-12 h-12 flex items-center justify-center rounded-lg transition-all duration-300
                          bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20
                          group-hover:border-amber-500/40
                        `}>
                          <span className="text-2xl">{item.icon}</span>
                        </div>
                        {/* Charges badge */}
                        {currentCharges > 0 && (
                          <div className="absolute -top-1 -right-1 px-1.5 py-0.5 bg-green-500 text-[0.6rem] font-mono text-black rounded-full min-w-[18px] text-center">
                            x{currentCharges}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <h3 className="text-sm font-medium">{item.name}</h3>
                        <p className="text-[0.7rem] text-[var(--text-muted)] max-w-[200px]">
                          {item.description}
                        </p>
                        {item.charges > 0 && (
                          <span className="text-[0.6rem] text-amber-400/70 font-mono">
                            +{item.charges} charge{item.charges > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right - Buy Button */}
                    <button
                      onClick={() => handleBuyItem(item.id)}
                      disabled={!canAfford}
                      className={`
                        relative px-4 py-2 text-[0.8rem] font-mono
                        border transition-all duration-200 
                        active:scale-95 overflow-hidden
                        ${canAfford
                          ? "border-amber-500/30 hover:border-amber-500/60 hover:text-amber-400 hover:shadow-lg hover:shadow-amber-500/10 cursor-pointer group/btn"
                          : "border-[var(--line)]/50 text-[var(--text-muted)] cursor-not-allowed"
                        }
                      `}
                    >
                      {canAfford && (
                        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/10 to-amber-500/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-500" />
                      )}
                      <span className="relative">{item.price}€</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Stats Recap - Premium Design */}
      <div className="mt-6 relative overflow-hidden border border-[var(--line)]/50 bg-gradient-to-br from-white/[0.03] to-transparent">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-green-500/5 to-transparent pointer-events-none" />
        
        <div className="relative p-5">
          <h3 className="text-[0.7rem] uppercase tracking-widest text-[var(--text-muted)] mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            bonus actifs
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-3 bg-white/[0.02] border border-[var(--line)]/30 rounded-lg">
              <p className="text-xl font-mono text-green-400">
                +{calculateBonus("click", upgrades).toFixed(3)}€
              </p>
              <p className="text-[0.65rem] text-[var(--text-muted)] mt-1">par clic</p>
            </div>
            <div className="p-3 bg-white/[0.02] border border-[var(--line)]/30 rounded-lg">
              <p className="text-xl font-mono text-blue-400">
                +{calculateBonus("passive", upgrades).toFixed(3)}€
              </p>
              <p className="text-[0.65rem] text-[var(--text-muted)] mt-1">passif/min</p>
            </div>
            <div className="p-3 bg-white/[0.02] border border-[var(--line)]/30 rounded-lg">
              <p className="text-xl font-mono text-purple-400">
                +{calculateBonus("vocal", upgrades).toFixed(3)}€
              </p>
              <p className="text-[0.65rem] text-[var(--text-muted)] mt-1">vocal/min</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
