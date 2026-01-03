// Définition de tous les upgrades disponibles (partagé entre web et bot)

export type UpgradeCategory = "click" | "passive" | "vocal";

export interface Upgrade {
  id: string;
  name: string;
  description: string;
  category: UpgradeCategory;
  basePrice: number;
  effect: number;
  maxLevel: number;
  icon: string;
}

export function getPriceForLevel(basePrice: number, currentLevel: number): number {
  const multipliers = [1, 1.5, 2];
  return Math.round(basePrice * (multipliers[currentLevel] || 1));
}

export const UPGRADES: Record<string, Upgrade> = {
  // Click upgrades
  souris_gaming: {
    id: "souris_gaming",
    name: "Souris Gaming",
    description: "+0.002€ par clic",
    category: "click",
    basePrice: 15,
    effect: 0.002,
    maxLevel: 3,
    icon: "🖱️",
  },
  clavier_meca: {
    id: "clavier_meca",
    name: "Clavier Mécanique",
    description: "+0.003€ par clic",
    category: "click",
    basePrice: 30,
    effect: 0.003,
    maxLevel: 3,
    icon: "⌨️",
  },
  setup_complet: {
    id: "setup_complet",
    name: "Setup Complet",
    description: "+0.005€ par clic",
    category: "click",
    basePrice: 60,
    effect: 0.005,
    maxLevel: 3,
    icon: "🖥️",
  },

  // Passive upgrades
  chaise_gaming: {
    id: "chaise_gaming",
    name: "Chaise Gaming",
    description: "+0.003€ par minute",
    category: "passive",
    basePrice: 20,
    effect: 0.003,
    maxLevel: 3,
    icon: "🪑",
  },
  rig_minage: {
    id: "rig_minage",
    name: "Rig de Minage",
    description: "+0.006€ par minute",
    category: "passive",
    basePrice: 50,
    effect: 0.006,
    maxLevel: 3,
    icon: "⛏️",
  },
  datacenter: {
    id: "datacenter",
    name: "Datacenter",
    description: "+0.012€ par minute",
    category: "passive",
    basePrice: 120,
    effect: 0.012,
    maxLevel: 3,
    icon: "🏢",
  },

  // Vocal upgrades
  micro_pro: {
    id: "micro_pro",
    name: "Micro Pro",
    description: "+0.008€ par minute en vocal",
    category: "vocal",
    basePrice: 25,
    effect: 0.008,
    maxLevel: 3,
    icon: "🎙️",
  },
  casque_71: {
    id: "casque_71",
    name: "Casque 7.1",
    description: "+0.012€ par minute en vocal",
    category: "vocal",
    basePrice: 50,
    effect: 0.012,
    maxLevel: 3,
    icon: "🎧",
  },
};

export interface UserUpgradeData {
  upgradeId: string;
  level: number;
}

export function calculateClickBonus(userUpgrades: UserUpgradeData[]): number {
  let bonus = 0;
  for (const ug of userUpgrades) {
    const upgrade = UPGRADES[ug.upgradeId];
    if (upgrade && upgrade.category === "click") {
      bonus += upgrade.effect * ug.level;
    }
  }
  return bonus;
}

export function calculatePassiveBonus(userUpgrades: UserUpgradeData[]): number {
  let bonus = 0;
  for (const ug of userUpgrades) {
    const upgrade = UPGRADES[ug.upgradeId];
    if (upgrade && upgrade.category === "passive") {
      bonus += upgrade.effect * ug.level;
    }
  }
  return bonus;
}

export function calculateVocalBonus(userUpgrades: UserUpgradeData[]): number {
  let bonus = 0;
  for (const ug of userUpgrades) {
    const upgrade = UPGRADES[ug.upgradeId];
    if (upgrade && upgrade.category === "vocal") {
      bonus += upgrade.effect * ug.level;
    }
  }
  return bonus;
}

export const UPGRADE_CATEGORIES = {
  click: {
    name: "Clics",
    description: "Augmente tes gains par clic",
    icon: "👆",
  },
  passive: {
    name: "Passif",
    description: "Revenus automatiques chaque minute",
    icon: "💤",
  },
  vocal: {
    name: "Vocal",
    description: "Bonus quand t'es en vocal",
    icon: "🎤",
  },
};
