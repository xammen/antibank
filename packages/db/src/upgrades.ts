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

// ============================================
// ITEMS CONSOMMABLES (Braquages, protection, etc.)
// ============================================

export type ItemCategory = "robbery" | "protection" | "casino" | "special";

export interface ConsumableItem {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  price: number;
  charges: number; // Nombre d'utilisations
  effect: {
    type: string;
    value: number;
  };
  icon: string;
}

export const ITEMS: Record<string, ConsumableItem> = {
  // Items de braquage
  pied_de_biche: {
    id: "pied_de_biche",
    name: "Pied-de-biche",
    description: "+15% de chances de reussite pour les braquages",
    category: "robbery",
    price: 8,
    charges: 3,
    effect: { type: "robbery_chance", value: 15 },
    icon: "🔧",
  },
  cagoule_pro: {
    id: "cagoule_pro",
    name: "Cagoule Pro",
    description: "+10% de chances + 5% de butin supplementaire",
    category: "robbery",
    price: 15,
    charges: 2,
    effect: { type: "robbery_bonus", value: 10 },
    icon: "🎭",
  },
  plan_batiment: {
    id: "plan_batiment",
    name: "Plan du batiment",
    description: "+25% de chances pour le prochain braquage",
    category: "robbery",
    price: 20,
    charges: 1,
    effect: { type: "robbery_chance", value: 25 },
    icon: "📋",
  },
  talkie_walkie: {
    id: "talkie_walkie",
    name: "Talkie-walkie",
    description: "reduit la penalite d'echec de 50%",
    category: "robbery",
    price: 12,
    charges: 2,
    effect: { type: "robbery_penalty_reduce", value: 50 },
    icon: "📻",
  },

  // Items de protection
  gilet_pare_balles: {
    id: "gilet_pare_balles",
    name: "Gilet pare-balles",
    description: "-50% de pertes si tu te fais braquer",
    category: "protection",
    price: 15,
    charges: 1,
    effect: { type: "robbery_defense", value: 50 },
    icon: "🦺",
  },
  coffre_fort: {
    id: "coffre_fort",
    name: "Coffre-fort",
    description: "protege 30% de ton solde des braquages (permanent)",
    category: "protection",
    price: 50,
    charges: -1, // -1 = permanent
    effect: { type: "balance_protection", value: 30 },
    icon: "🔐",
  },
  alarme: {
    id: "alarme",
    name: "Systeme d'alarme",
    description: "-20% de chances de te faire braquer",
    category: "protection",
    price: 25,
    charges: 5,
    effect: { type: "robbery_target_reduce", value: 20 },
    icon: "🚨",
  },

  // Items casino
  de_pipe: {
    id: "de_pipe",
    name: "De pipe",
    description: "+15% de chances aux jeux de des",
    category: "casino",
    price: 20,
    charges: 3,
    effect: { type: "dice_bonus", value: 15 },
    icon: "🎲",
  },
  lunettes_poker: {
    id: "lunettes_poker",
    name: "Lunettes de poker",
    description: "vois les 5 derniers crashs avant de miser",
    category: "casino",
    price: 10,
    charges: 5,
    effect: { type: "crash_history", value: 5 },
    icon: "🕶️",
  },

  // Items speciaux
  vpn: {
    id: "vpn",
    name: "VPN Premium",
    description: "immunite aux braquages pendant 4h",
    category: "special",
    price: 25,
    charges: 1,
    effect: { type: "robbery_immunity", value: 4 }, // 4 heures
    icon: "🔒",
  },
  insider_info: {
    id: "insider_info",
    name: "Info d'initie",
    description: "connait la tendance du dahkacoin 10min a l'avance",
    category: "special",
    price: 30,
    charges: 1,
    effect: { type: "dc_prediction", value: 10 },
    icon: "📈",
  },
};

export const ITEM_CATEGORIES = {
  robbery: {
    name: "Braquage",
    description: "Augmente tes chances de reussite",
    icon: "🔫",
  },
  protection: {
    name: "Protection",
    description: "Protege-toi des braquages",
    icon: "🛡️",
  },
  casino: {
    name: "Casino",
    description: "Avantages aux jeux",
    icon: "🎰",
  },
  special: {
    name: "Special",
    description: "Items uniques",
    icon: "✨",
  },
};

// Fonction pour calculer le bonus de braquage d'un joueur
export function calculateRobberyBonus(activeItems: string[]): {
  chanceBonus: number;
  stealBonus: number;
  penaltyReduction: number;
} {
  let chanceBonus = 0;
  let stealBonus = 0;
  let penaltyReduction = 0;

  for (const itemId of activeItems) {
    const item = ITEMS[itemId];
    if (!item) continue;

    switch (item.effect.type) {
      case "robbery_chance":
        chanceBonus += item.effect.value;
        break;
      case "robbery_bonus":
        chanceBonus += item.effect.value;
        stealBonus += 5; // Bonus butin fixe
        break;
      case "robbery_penalty_reduce":
        penaltyReduction += item.effect.value;
        break;
    }
  }

  return { chanceBonus, stealBonus, penaltyReduction };
}
