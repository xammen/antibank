// ============================================
// DAHKACOIN EVENT SYSTEM - COMPREHENSIVE DESIGN
// ============================================
// "Chaos should feel unfair in the moment but fair over time."

// ============================================
// TYPE DEFINITIONS
// ============================================

export type MarketPhase = 
  | 'accumulation'   // Quiet, low volatility, price slowly building
  | 'markup'         // Uptrend beginning, momentum building
  | 'euphoria'       // MOON MODE - explosive growth
  | 'distribution'   // Top forming, choppy
  | 'decline'        // Downtrend, fear
  | 'capitulation'   // CRASH MODE - panic
  | 'recovery';      // Bottom forming

export type EventCategory = 
  | 'market'        // Direct price impact
  | 'volatility'    // Changes HOW price moves
  | 'timing'        // Affects phase transitions
  | 'special'       // Unique mechanics
  | 'scheduled';    // Predictable events

export type EventSeverity = 'minor' | 'moderate' | 'major' | 'catastrophic';

export interface EventEffect {
  // Price effects
  priceImpact?: { 
    min: number; 
    max: number; 
    direction: 'up' | 'down' | 'random';
    curve?: 'linear' | 'exponential' | 'spike' | 'oscillating';
  };
  
  // Volatility effects
  volatilityMultiplier?: number;
  doubleVolatility?: boolean;
  freezeVolatility?: boolean;
  
  // Momentum effects
  momentumShift?: number;
  invertMomentum?: boolean;
  lockMomentum?: boolean;
  
  // Phase effects
  phaseSkip?: MarketPhase;
  extendPhase?: number;       // seconds to add
  shortenPhase?: number;      // seconds to remove
  freezePhase?: boolean;
  
  // Special mechanics
  freezePrice?: boolean;
  mirrorPrice?: boolean;      // Price moves opposite to normal
  quantumPrice?: boolean;     // Price exists in superposition until observed
  retroactiveChange?: boolean; // Changes recent price history
  
  // Trading effects
  disableTrading?: boolean;
  doubleFees?: boolean;
  zeroFees?: boolean;
  buyOnly?: boolean;
  sellOnly?: boolean;
  
  // Player effects
  revealHoldings?: boolean;   // Everyone sees who holds what
  shuffleHoldings?: boolean;  // Random redistribution
  bonusForHolders?: number;   // % bonus for current holders
  taxForHolders?: number;     // % tax on current holders
}

export interface EventSchedule {
  type: 'interval' | 'countdown' | 'random_window' | 'phase_based';
  value: number;              // seconds
  warningTime: number;        // seconds before event, show warning
  phases?: MarketPhase[];     // only trigger in these phases
}

export interface DCEvent {
  id: string;
  name: string;               // French display name
  emoji: string;
  category: EventCategory;
  severity: EventSeverity;
  
  // Trigger conditions
  probability: number;        // base chance per tick (1 second)
  phaseMultipliers: Partial<Record<MarketPhase, number>>;
  cooldown: number;           // seconds before can trigger again
  
  // Duration
  duration: { min: number; max: number };  // in seconds
  
  // Effects
  effects: EventEffect;
  
  // For scheduled events
  schedule?: EventSchedule;
  
  // UI
  description: string;        // What players see
  warning?: string;           // If predictable, what warning shows
  color: string;              // For banner (hex)
  soundEffect?: string;       // Optional sound cue
  
  // Callbacks for complex logic
  onStart?: string;           // Function name to call on start
  onTick?: string;            // Function name to call each tick
  onEnd?: string;             // Function name to call on end
}

// ============================================
// EVENT DEFINITIONS
// ============================================

export const DC_EVENTS: Record<string, DCEvent> = {
  
  // ==========================================
  // CATEGORY 1: MARKET EVENTS (Direct Price Impact)
  // ==========================================
  
  whale_pump: {
    id: 'whale_pump',
    name: 'Baleine Acheteuse',
    emoji: '🐋📈',
    category: 'market',
    severity: 'moderate',
    probability: 0.0008,
    phaseMultipliers: {
      accumulation: 2.0,
      markup: 1.5,
      recovery: 1.5,
      euphoria: 0.5,
      distribution: 0.3,
      decline: 0.5,
      capitulation: 1.0,
    },
    cooldown: 60,
    duration: { min: 15, max: 45 },
    effects: {
      priceImpact: { min: 0.20, max: 0.80, direction: 'up', curve: 'exponential' },
      momentumShift: 0.3,
    },
    description: "Une baleine achete massivement! Le prix monte en fleche!",
    color: '#00ff88',
  },
  
  whale_dump: {
    id: 'whale_dump',
    name: 'Baleine Vendeuse',
    emoji: '🐋📉',
    category: 'market',
    severity: 'moderate',
    probability: 0.0008,
    phaseMultipliers: {
      euphoria: 2.5,
      distribution: 2.0,
      decline: 1.5,
      accumulation: 0.3,
      markup: 0.5,
      recovery: 0.5,
      capitulation: 0.3,
    },
    cooldown: 60,
    duration: { min: 15, max: 45 },
    effects: {
      priceImpact: { min: 0.15, max: 0.50, direction: 'down', curve: 'exponential' },
      momentumShift: -0.3,
    },
    description: "Une baleine liquide sa position! Panique sur le marche!",
    color: '#ff4444',
  },
  
  flash_crash: {
    id: 'flash_crash',
    name: 'Flash Crash',
    emoji: '⚡💥',
    category: 'market',
    severity: 'major',
    probability: 0.0002,
    phaseMultipliers: {
      euphoria: 2.0,
      distribution: 1.5,
      decline: 1.5,
      capitulation: 0.3,  // Already crashing
      accumulation: 0.5,
      markup: 0.5,
      recovery: 0.5,
    },
    cooldown: 300,  // 5 min cooldown
    duration: { min: 5, max: 20 },
    effects: {
      priceImpact: { min: 0.30, max: 0.60, direction: 'down', curve: 'spike' },
      volatilityMultiplier: 3.0,
      momentumShift: -0.8,
    },
    description: "FLASH CRASH! Le prix s'effondre instantanement!",
    color: '#ff0000',
    soundEffect: 'crash',
  },
  
  mega_pump: {
    id: 'mega_pump',
    name: 'MEGA PUMP',
    emoji: '🚀🌙',
    category: 'market',
    severity: 'catastrophic',
    probability: 0.0001,
    phaseMultipliers: {
      accumulation: 1.5,
      markup: 2.5,
      recovery: 2.0,
      euphoria: 0.3,  // Already mooning
      distribution: 0.2,
      decline: 0.3,
      capitulation: 0.5,
    },
    cooldown: 600,  // 10 min cooldown
    duration: { min: 60, max: 180 },
    effects: {
      priceImpact: { min: 1.50, max: 4.00, direction: 'up', curve: 'exponential' },
      volatilityMultiplier: 2.0,
      momentumShift: 1.0,
      phaseSkip: 'euphoria',
    },
    description: "🚀 TO THE MOON! Le prix explose! +200% a +500%!",
    warning: "Des rumeurs circulent sur un pump imminent...",
    color: '#ffff00',
    soundEffect: 'moon',
  },
  
  coordinated_pump: {
    id: 'coordinated_pump',
    name: 'Pump Coordonne',
    emoji: '🤝📈',
    category: 'market',
    severity: 'moderate',
    probability: 0.0004,
    phaseMultipliers: {
      accumulation: 2.0,
      markup: 1.5,
      recovery: 1.5,
      euphoria: 0.5,
      distribution: 0.3,
      decline: 0.5,
      capitulation: 0.8,
    },
    cooldown: 120,
    duration: { min: 30, max: 90 },
    effects: {
      priceImpact: { min: 0.30, max: 0.80, direction: 'up', curve: 'linear' },
      momentumShift: 0.4,
    },
    description: "Un groupe de traders coordonne leurs achats!",
    color: '#00ccff',
  },
  
  rug_pull: {
    id: 'rug_pull',
    name: 'RUG PULL',
    emoji: '🧹💀',
    category: 'market',
    severity: 'catastrophic',
    probability: 0.00005,
    phaseMultipliers: {
      euphoria: 5.0,  // Most likely at the top
      distribution: 3.0,
      markup: 1.0,
      decline: 0.5,
      capitulation: 0.1,
      accumulation: 0.2,
      recovery: 0.3,
    },
    cooldown: 1800,  // 30 min cooldown
    duration: { min: 10, max: 30 },
    effects: {
      priceImpact: { min: 0.70, max: 0.95, direction: 'down', curve: 'spike' },
      volatilityMultiplier: 5.0,
      momentumShift: -1.0,
      phaseSkip: 'capitulation',
      disableTrading: true,  // 10 second trading halt
    },
    description: "⚠️ RUG PULL! Les fondateurs ont vendu! -70% a -95%!",
    color: '#800000',
    soundEffect: 'alarm',
  },

  // ==========================================
  // CATEGORY 2: VOLATILITY EVENTS
  // ==========================================
  
  volatility_storm: {
    id: 'volatility_storm',
    name: 'Tempete de Volatilite',
    emoji: '🌪️📊',
    category: 'volatility',
    severity: 'moderate',
    probability: 0.0006,
    phaseMultipliers: {
      distribution: 2.0,
      decline: 1.5,
      euphoria: 1.5,
      accumulation: 0.5,
      markup: 1.0,
      recovery: 1.0,
      capitulation: 1.5,
    },
    cooldown: 90,
    duration: { min: 60, max: 180 },
    effects: {
      volatilityMultiplier: 4.0,
      priceImpact: { min: 0, max: 0.05, direction: 'random', curve: 'oscillating' },
    },
    description: "La volatilite explose! Le prix fait du yo-yo!",
    color: '#9933ff',
  },
  
  dead_cat_bounce: {
    id: 'dead_cat_bounce',
    name: 'Dead Cat Bounce',
    emoji: '🐱💀📈',
    category: 'volatility',
    severity: 'moderate',
    probability: 0.0005,
    phaseMultipliers: {
      capitulation: 5.0,  // Only really happens in crashes
      decline: 2.0,
      distribution: 1.0,
      accumulation: 0.1,
      markup: 0.1,
      euphoria: 0.1,
      recovery: 0.5,
    },
    cooldown: 120,
    duration: { min: 30, max: 90 },
    effects: {
      priceImpact: { min: 0.20, max: 0.50, direction: 'up', curve: 'spike' },
      momentumShift: 0.3,
      // After duration ends, triggers secondary crash
    },
    onEnd: 'triggerSecondaryDrop',
    description: "Rebond technique! Attention, c'est peut-etre un piege!",
    warning: "Le prix rebondit... mais pour combien de temps?",
    color: '#ffaa00',
  },
  
  calm_before_storm: {
    id: 'calm_before_storm',
    name: 'Calme Avant la Tempete',
    emoji: '😶🌫️',
    category: 'volatility',
    severity: 'minor',
    probability: 0.0008,
    phaseMultipliers: {
      accumulation: 2.0,
      distribution: 2.0,
      markup: 1.0,
      decline: 1.0,
      euphoria: 0.5,
      capitulation: 0.3,
      recovery: 1.5,
    },
    cooldown: 180,
    duration: { min: 60, max: 120 },
    effects: {
      volatilityMultiplier: 0.1,  // Almost no movement
      freezeVolatility: true,
      lockMomentum: true,
    },
    onEnd: 'triggerVolatilityExplosion',
    description: "Le marche est etrangement calme... ca sent le piege.",
    warning: "⚠️ Volatilite anormalement basse...",
    color: '#666666',
  },
  
  momentum_reversal: {
    id: 'momentum_reversal',
    name: 'Retournement de Momentum',
    emoji: '🔄⚡',
    category: 'volatility',
    severity: 'moderate',
    probability: 0.0004,
    phaseMultipliers: {
      euphoria: 2.0,
      capitulation: 2.0,
      markup: 1.5,
      decline: 1.5,
      distribution: 1.0,
      accumulation: 0.5,
      recovery: 1.0,
    },
    cooldown: 120,
    duration: { min: 5, max: 15 },
    effects: {
      invertMomentum: true,
      volatilityMultiplier: 2.0,
    },
    description: "Le momentum s'inverse brutalement!",
    color: '#ff00ff',
  },
  
  quantum_uncertainty: {
    id: 'quantum_uncertainty',
    name: 'Incertitude Quantique',
    emoji: '⚛️❓',
    category: 'volatility',
    severity: 'major',
    probability: 0.0002,
    phaseMultipliers: {
      accumulation: 1.0,
      markup: 1.0,
      euphoria: 1.0,
      distribution: 1.5,
      decline: 1.0,
      capitulation: 1.0,
      recovery: 1.0,
    },
    cooldown: 300,
    duration: { min: 30, max: 60 },
    effects: {
      quantumPrice: true,
      // Price shows as "???" until you trade, then collapses to actual value
    },
    description: "Le prix existe dans une superposition quantique! Achetez pour le reveler!",
    color: '#00ffff',
  },

  // ==========================================
  // CATEGORY 3: TIMING EVENTS (Phase Manipulation)
  // ==========================================
  
  phase_accelerator: {
    id: 'phase_accelerator',
    name: 'Accelerateur de Phase',
    emoji: '⏩🔥',
    category: 'timing',
    severity: 'moderate',
    probability: 0.0005,
    phaseMultipliers: {
      accumulation: 1.5,
      markup: 1.5,
      distribution: 1.5,
      decline: 1.5,
      recovery: 1.5,
      euphoria: 0.5,  // Don't speed up the good times
      capitulation: 0.5,  // Don't speed up the bad times
    },
    cooldown: 180,
    duration: { min: 60, max: 180 },
    effects: {
      shortenPhase: 0.5,  // Phase ends 50% faster
      volatilityMultiplier: 1.5,
    },
    description: "Le marche accelere! Les phases changent plus vite!",
    color: '#ff6600',
  },
  
  phase_freeze: {
    id: 'phase_freeze',
    name: 'Gel de Phase',
    emoji: '🧊⏸️',
    category: 'timing',
    severity: 'moderate',
    probability: 0.0004,
    phaseMultipliers: {
      euphoria: 2.0,  // Players want to freeze the moon
      capitulation: 0.3,  // Don't freeze the crash
      accumulation: 1.0,
      markup: 1.5,
      distribution: 1.0,
      decline: 0.5,
      recovery: 1.0,
    },
    cooldown: 240,
    duration: { min: 60, max: 180 },
    effects: {
      freezePhase: true,
      extendPhase: 120,
    },
    description: "La phase actuelle est gelee! Le temps s'arrete!",
    color: '#00ccff',
  },
  
  forced_transition: {
    id: 'forced_transition',
    name: 'Transition Forcee',
    emoji: '⚡🔀',
    category: 'timing',
    severity: 'major',
    probability: 0.0002,
    phaseMultipliers: {
      accumulation: 1.0,
      markup: 1.0,
      euphoria: 1.5,
      distribution: 1.5,
      decline: 1.0,
      capitulation: 1.0,
      recovery: 1.0,
    },
    cooldown: 300,
    duration: { min: 5, max: 10 },
    effects: {
      // Random phase skip - could be good or bad!
      phaseSkip: 'random' as unknown as MarketPhase,  // Will be randomized at trigger
    },
    description: "TRANSITION FORCEE! Le marche saute a une phase aleatoire!",
    color: '#ff00ff',
    soundEffect: 'transition',
  },
  
  time_loop: {
    id: 'time_loop',
    name: 'Boucle Temporelle',
    emoji: '🔁⏰',
    category: 'timing',
    severity: 'major',
    probability: 0.0001,
    phaseMultipliers: {
      accumulation: 1.0,
      markup: 1.0,
      euphoria: 1.0,
      distribution: 1.0,
      decline: 1.0,
      capitulation: 1.0,
      recovery: 1.0,
    },
    cooldown: 600,
    duration: { min: 30, max: 60 },
    effects: {
      retroactiveChange: true,
      // Price reverts to what it was 5 minutes ago
    },
    onStart: 'revertPriceHistory',
    description: "BOUCLE TEMPORELLE! Le prix revient 5 minutes en arriere!",
    color: '#9900ff',
  },

  // ==========================================
  // CATEGORY 4: SPECIAL MECHANICS
  // ==========================================
  
  trading_halt: {
    id: 'trading_halt',
    name: 'Suspension des Echanges',
    emoji: '🚫💱',
    category: 'special',
    severity: 'major',
    probability: 0.0003,
    phaseMultipliers: {
      capitulation: 2.0,  // Circuit breaker
      euphoria: 1.5,
      decline: 1.5,
      distribution: 1.0,
      accumulation: 0.3,
      markup: 0.5,
      recovery: 0.5,
    },
    cooldown: 300,
    duration: { min: 30, max: 90 },
    effects: {
      disableTrading: true,
      freezePrice: true,
    },
    description: "⚠️ SUSPENSION DES ECHANGES! Impossible d'acheter ou vendre!",
    warning: "Le regulateur surveille le marche...",
    color: '#ff0000',
  },
  
  buy_frenzy: {
    id: 'buy_frenzy',
    name: 'Frenesie d\'Achat',
    emoji: '🛒🔥',
    category: 'special',
    severity: 'moderate',
    probability: 0.0004,
    phaseMultipliers: {
      accumulation: 2.0,
      markup: 2.0,
      recovery: 1.5,
      euphoria: 0.5,
      distribution: 0.3,
      decline: 0.5,
      capitulation: 0.8,
    },
    cooldown: 180,
    duration: { min: 60, max: 180 },
    effects: {
      sellOnly: false,
      buyOnly: false,  // Normal trading
      zeroFees: true,
      priceImpact: { min: 0.10, max: 0.30, direction: 'up', curve: 'linear' },
    },
    description: "FRENESIE D'ACHAT! 0% de frais sur les achats!",
    color: '#00ff00',
  },
  
  panic_sell: {
    id: 'panic_sell',
    name: 'Vente Panique',
    emoji: '😱📉',
    category: 'special',
    severity: 'moderate',
    probability: 0.0004,
    phaseMultipliers: {
      capitulation: 2.0,
      decline: 2.0,
      distribution: 1.5,
      euphoria: 0.5,
      accumulation: 0.3,
      markup: 0.3,
      recovery: 0.5,
    },
    cooldown: 180,
    duration: { min: 60, max: 180 },
    effects: {
      doubleFees: true,
      priceImpact: { min: 0.15, max: 0.40, direction: 'down', curve: 'linear' },
    },
    description: "VENTE PANIQUE! Les frais doublent mais tout le monde vend!",
    color: '#ff4444',
  },
  
  diamond_hands_bonus: {
    id: 'diamond_hands_bonus',
    name: 'Bonus Diamond Hands',
    emoji: '💎🙌',
    category: 'special',
    severity: 'moderate',
    probability: 0.0003,
    phaseMultipliers: {
      capitulation: 3.0,  // Reward holders during crash
      decline: 2.0,
      distribution: 1.0,
      accumulation: 0.5,
      markup: 0.5,
      euphoria: 0.5,
      recovery: 1.0,
    },
    cooldown: 300,
    duration: { min: 10, max: 30 },
    effects: {
      bonusForHolders: 0.05,  // 5% bonus DC for all holders
    },
    description: "💎 DIAMOND HANDS! Tous les holders recoivent +5% de DC gratuit!",
    color: '#00ffff',
    soundEffect: 'reward',
  },
  
  paper_hands_tax: {
    id: 'paper_hands_tax',
    name: 'Taxe Paper Hands',
    emoji: '📄🙌💸',
    category: 'special',
    severity: 'moderate',
    probability: 0.0003,
    phaseMultipliers: {
      euphoria: 2.0,  // Tax sellers at the top
      distribution: 1.5,
      markup: 1.0,
      decline: 0.5,
      capitulation: 0.3,
      accumulation: 0.5,
      recovery: 0.5,
    },
    cooldown: 300,
    duration: { min: 60, max: 180 },
    effects: {
      doubleFees: true,
    },
    description: "📄 TAXE PAPER HANDS! Les frais de vente doublent!",
    color: '#ffaa00',
  },
  
  whale_watching: {
    id: 'whale_watching',
    name: 'Surveillance des Baleines',
    emoji: '🔍🐋',
    category: 'special',
    severity: 'minor',
    probability: 0.0006,
    phaseMultipliers: {
      accumulation: 1.5,
      markup: 1.5,
      euphoria: 1.0,
      distribution: 1.5,
      decline: 1.0,
      capitulation: 1.0,
      recovery: 1.0,
    },
    cooldown: 120,
    duration: { min: 120, max: 300 },
    effects: {
      revealHoldings: true,
    },
    description: "🔍 Les positions de tous les joueurs sont revelees!",
    color: '#ffff00',
  },
  
  communist_redistribution: {
    id: 'communist_redistribution',
    name: 'Redistribution Communiste',
    emoji: '☭🔄',
    category: 'special',
    severity: 'catastrophic',
    probability: 0.00003,
    phaseMultipliers: {
      accumulation: 1.0,
      markup: 1.0,
      euphoria: 1.0,
      distribution: 1.0,
      decline: 1.0,
      capitulation: 1.0,
      recovery: 1.0,
    },
    cooldown: 3600,  // 1 hour cooldown
    duration: { min: 5, max: 10 },
    effects: {
      shuffleHoldings: true,
    },
    description: "☭ REVOLUTION! Tous les DahkaCoins sont redistribues aleatoirement!",
    color: '#ff0000',
    soundEffect: 'revolution',
  },
  
  mirror_dimension: {
    id: 'mirror_dimension',
    name: 'Dimension Miroir',
    emoji: '🪞🔄',
    category: 'special',
    severity: 'major',
    probability: 0.0002,
    phaseMultipliers: {
      accumulation: 1.0,
      markup: 1.0,
      euphoria: 1.5,
      distribution: 1.5,
      decline: 1.0,
      capitulation: 1.0,
      recovery: 1.0,
    },
    cooldown: 300,
    duration: { min: 60, max: 180 },
    effects: {
      mirrorPrice: true,
      // Price moves opposite to normal momentum
    },
    description: "🪞 DIMENSION MIROIR! Le prix evolue a l'inverse!",
    color: '#9900ff',
  },

  // ==========================================
  // CATEGORY 5: SCHEDULED/PREDICTABLE EVENTS
  // ==========================================
  
  daily_lottery: {
    id: 'daily_lottery',
    name: 'Loterie Quotidienne',
    emoji: '🎰🎲',
    category: 'scheduled',
    severity: 'moderate',
    probability: 0,  // Scheduled, not random
    phaseMultipliers: {},
    cooldown: 0,
    duration: { min: 60, max: 60 },
    effects: {
      // Random player wins 10% of total DC in circulation
    },
    schedule: {
      type: 'interval',
      value: 86400,  // 24 hours
      warningTime: 3600,  // 1 hour warning
    },
    description: "🎰 LOTERIE QUOTIDIENNE! Un joueur aleatoire gagne 10% du DC total!",
    warning: "⏰ Loterie dans 1 heure! Achetez vos DC pour participer!",
    color: '#ffff00',
    soundEffect: 'lottery',
  },
  
  hourly_volatility_spike: {
    id: 'hourly_volatility_spike',
    name: 'Pic de Volatilite Horaire',
    emoji: '⏰📊',
    category: 'scheduled',
    severity: 'minor',
    probability: 0,
    phaseMultipliers: {},
    cooldown: 0,
    duration: { min: 300, max: 300 },  // 5 minutes
    effects: {
      volatilityMultiplier: 3.0,
    },
    schedule: {
      type: 'interval',
      value: 3600,  // Every hour
      warningTime: 300,  // 5 min warning
    },
    description: "⏰ PIC DE VOLATILITE! Le marche devient fou pendant 5 minutes!",
    warning: "⚠️ Pic de volatilite dans 5 minutes...",
    color: '#ff6600',
  },
  
  weekend_chaos: {
    id: 'weekend_chaos',
    name: 'Chaos du Weekend',
    emoji: '🎉🔥',
    category: 'scheduled',
    severity: 'major',
    probability: 0,
    phaseMultipliers: {},
    cooldown: 0,
    duration: { min: 7200, max: 7200 },  // 2 hours
    effects: {
      volatilityMultiplier: 5.0,
      zeroFees: true,
    },
    schedule: {
      type: 'random_window',
      value: 172800,  // Within 48 hours (weekend)
      warningTime: 1800,  // 30 min warning
    },
    description: "🎉 CHAOS DU WEEKEND! Volatilite x5 et 0% de frais!",
    warning: "🎉 Le chaos du weekend approche...",
    color: '#ff00ff',
  },
  
  halving: {
    id: 'halving',
    name: 'Halving',
    emoji: '➗2️⃣',
    category: 'scheduled',
    severity: 'catastrophic',
    probability: 0,
    phaseMultipliers: {},
    cooldown: 0,
    duration: { min: 10, max: 10 },
    effects: {
      // All DC holdings are halved, but price doubles
      taxForHolders: 0.50,  // Lose 50% of holdings
      priceImpact: { min: 1.0, max: 1.0, direction: 'up', curve: 'spike' },  // +100%
    },
    schedule: {
      type: 'countdown',
      value: 604800,  // Every week
      warningTime: 86400,  // 24 hour warning
    },
    description: "➗ HALVING! Tous les DC sont divises par 2, mais le prix double!",
    warning: "⚠️ HALVING dans 24 heures! Preparez-vous!",
    color: '#ffaa00',
    soundEffect: 'halving',
  },
  
  burn_event: {
    id: 'burn_event',
    name: 'Burn Event',
    emoji: '🔥💀',
    category: 'scheduled',
    severity: 'major',
    probability: 0,
    phaseMultipliers: {},
    cooldown: 0,
    duration: { min: 300, max: 300 },  // 5 minutes
    effects: {
      // 5% of all DC is burned, increasing scarcity
      taxForHolders: 0.05,
      priceImpact: { min: 0.10, max: 0.20, direction: 'up', curve: 'linear' },
    },
    schedule: {
      type: 'interval',
      value: 43200,  // Every 12 hours
      warningTime: 1800,  // 30 min warning
    },
    description: "🔥 BURN EVENT! 5% du DC total est brule!",
    warning: "🔥 Burn event dans 30 minutes...",
    color: '#ff4400',
  },
  
  airdrop: {
    id: 'airdrop',
    name: 'Airdrop',
    emoji: '🎁✨',
    category: 'scheduled',
    severity: 'moderate',
    probability: 0,
    phaseMultipliers: {},
    cooldown: 0,
    duration: { min: 60, max: 60 },
    effects: {
      bonusForHolders: 0.10,  // 10% bonus DC
      priceImpact: { min: 0.05, max: 0.15, direction: 'down', curve: 'linear' },  // Slight dump from selling
    },
    schedule: {
      type: 'random_window',
      value: 86400,  // Within 24 hours
      warningTime: 600,  // 10 min warning
    },
    description: "🎁 AIRDROP! Tous les holders recoivent +10% de DC!",
    warning: "🎁 Un airdrop arrive bientot...",
    color: '#00ff88',
    soundEffect: 'airdrop',
  },
  
  market_open: {
    id: 'market_open',
    name: 'Ouverture du Marche',
    emoji: '🔔📈',
    category: 'scheduled',
    severity: 'minor',
    probability: 0,
    phaseMultipliers: {},
    cooldown: 0,
    duration: { min: 900, max: 900 },  // 15 minutes
    effects: {
      volatilityMultiplier: 2.0,
      zeroFees: true,
    },
    schedule: {
      type: 'interval',
      value: 86400,  // Daily at "market open"
      warningTime: 300,
    },
    description: "🔔 OUVERTURE DU MARCHE! 15 min de volatilite et 0% frais!",
    warning: "🔔 Le marche ouvre dans 5 minutes!",
    color: '#00ff00',
  },
};

// ============================================
// EVENT HELPER FUNCTIONS
// ============================================

export function getEventsByCategory(category: EventCategory): DCEvent[] {
  return Object.values(DC_EVENTS).filter(e => e.category === category);
}

export function getEventsBySeverity(severity: EventSeverity): DCEvent[] {
  return Object.values(DC_EVENTS).filter(e => e.severity === severity);
}

export function getScheduledEvents(): DCEvent[] {
  return Object.values(DC_EVENTS).filter(e => e.schedule !== undefined);
}

export function getRandomEvents(): DCEvent[] {
  return Object.values(DC_EVENTS).filter(e => e.probability > 0);
}

// ============================================
// EVENT TRIGGER LOGIC
// ============================================

export interface EventTriggerResult {
  triggered: boolean;
  event?: DCEvent;
  intensity?: number;
  duration?: number;
}

export function checkForEventTrigger(
  currentPhase: MarketPhase,
  lastEventTime: number,
  now: number,
  activeEvent: string | null
): EventTriggerResult {
  // Don't trigger if event is active
  if (activeEvent && activeEvent !== 'none') {
    return { triggered: false };
  }
  
  // Get all random events
  const randomEvents = getRandomEvents();
  
  for (const event of randomEvents) {
    // Check cooldown
    if (now - lastEventTime < event.cooldown * 1000) {
      continue;
    }
    
    // Calculate probability with phase multiplier
    const phaseMultiplier = event.phaseMultipliers[currentPhase] ?? 1.0;
    const adjustedProbability = event.probability * phaseMultiplier;
    
    // Roll the dice
    if (Math.random() < adjustedProbability) {
      const duration = event.duration.min + Math.random() * (event.duration.max - event.duration.min);
      const intensity = 0.5 + Math.random() * 0.5;  // 0.5 to 1.0
      
      return {
        triggered: true,
        event,
        intensity,
        duration: duration * 1000,  // Convert to ms
      };
    }
  }
  
  return { triggered: false };
}

// ============================================
// SCHEDULED EVENT LOGIC
// ============================================

export interface ScheduledEventState {
  eventId: string;
  nextTriggerTime: number;
  warningShown: boolean;
}

export function checkScheduledEvents(
  scheduledStates: ScheduledEventState[],
  now: number
): { 
  eventsToTrigger: DCEvent[]; 
  eventsToWarn: DCEvent[];
  updatedStates: ScheduledEventState[];
} {
  const eventsToTrigger: DCEvent[] = [];
  const eventsToWarn: DCEvent[] = [];
  const updatedStates: ScheduledEventState[] = [];
  
  for (const state of scheduledStates) {
    const event = DC_EVENTS[state.eventId];
    if (!event || !event.schedule) continue;
    
    const timeUntilTrigger = state.nextTriggerTime - now;
    
    // Check if should trigger
    if (timeUntilTrigger <= 0) {
      eventsToTrigger.push(event);
      
      // Calculate next trigger time
      let nextTrigger: number;
      if (event.schedule.type === 'interval') {
        nextTrigger = now + event.schedule.value * 1000;
      } else if (event.schedule.type === 'random_window') {
        nextTrigger = now + Math.random() * event.schedule.value * 1000;
      } else {
        nextTrigger = now + event.schedule.value * 1000;
      }
      
      updatedStates.push({
        eventId: state.eventId,
        nextTriggerTime: nextTrigger,
        warningShown: false,
      });
    } 
    // Check if should warn
    else if (timeUntilTrigger <= event.schedule.warningTime * 1000 && !state.warningShown) {
      eventsToWarn.push(event);
      updatedStates.push({
        ...state,
        warningShown: true,
      });
    } else {
      updatedStates.push(state);
    }
  }
  
  return { eventsToTrigger, eventsToWarn, updatedStates };
}

// ============================================
// UI DISPLAY HELPERS
// ============================================

export interface EventDisplayInfo {
  id: string;
  name: string;
  emoji: string;
  description: string;
  color: string;
  timeRemaining?: number;
  intensity?: number;
  isWarning?: boolean;
  warningText?: string;
}

export function getEventDisplayInfo(
  eventId: string,
  timeRemaining?: number,
  intensity?: number,
  isWarning?: boolean
): EventDisplayInfo | null {
  const event = DC_EVENTS[eventId];
  if (!event) return null;
  
  return {
    id: event.id,
    name: event.name,
    emoji: event.emoji,
    description: isWarning ? (event.warning || event.description) : event.description,
    color: event.color,
    timeRemaining,
    intensity,
    isWarning,
    warningText: event.warning,
  };
}

export function getSeverityColor(severity: EventSeverity): string {
  switch (severity) {
    case 'minor': return '#888888';
    case 'moderate': return '#ffaa00';
    case 'major': return '#ff4400';
    case 'catastrophic': return '#ff0000';
  }
}

export function getCategoryIcon(category: EventCategory): string {
  switch (category) {
    case 'market': return '📊';
    case 'volatility': return '🌪️';
    case 'timing': return '⏰';
    case 'special': return '✨';
    case 'scheduled': return '📅';
  }
}

// ============================================
// EVENT STATISTICS
// ============================================

export const EVENT_STATS = {
  totalEvents: Object.keys(DC_EVENTS).length,
  byCategory: {
    market: getEventsByCategory('market').length,
    volatility: getEventsByCategory('volatility').length,
    timing: getEventsByCategory('timing').length,
    special: getEventsByCategory('special').length,
    scheduled: getEventsByCategory('scheduled').length,
  },
  bySeverity: {
    minor: getEventsBySeverity('minor').length,
    moderate: getEventsBySeverity('moderate').length,
    major: getEventsBySeverity('major').length,
    catastrophic: getEventsBySeverity('catastrophic').length,
  },
  positiveEvents: Object.values(DC_EVENTS).filter(e => 
    e.effects.priceImpact?.direction === 'up' ||
    e.effects.bonusForHolders ||
    e.effects.zeroFees
  ).length,
  negativeEvents: Object.values(DC_EVENTS).filter(e =>
    e.effects.priceImpact?.direction === 'down' ||
    e.effects.taxForHolders ||
    e.effects.doubleFees
  ).length,
  neutralEvents: Object.values(DC_EVENTS).filter(e =>
    !e.effects.priceImpact ||
    e.effects.priceImpact.direction === 'random'
  ).length,
};
