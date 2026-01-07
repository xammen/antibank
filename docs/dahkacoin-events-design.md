# DahkaCoin Event System - Design Document

## Overview

Le systeme d'evenements DahkaCoin va bien au-dela des simples "pump/dump". Il cree une experience de trading crypto fictive riche avec:

- **22 evenements uniques** repartis en 5 categories
- **Mecaniques variees** (pas juste "prix monte/descend")
- **Evenements previsibles ET surprises** (anticipation + chaos)
- **Interactions avec les phases** du marche
- **Effets speciaux** (gel, miroir, quantique, redistribution...)

---

## Categories d'Evenements

### 1. MARKET (6 evenements) - Impact direct sur le prix

| ID | Nom | Emoji | Severite | Description |
|----|-----|-------|----------|-------------|
| `whale_pump` | Baleine Acheteuse | 🐋📈 | moderate | +20% a +80%, momentum +0.3 |
| `whale_dump` | Baleine Vendeuse | 🐋📉 | moderate | -15% a -50%, momentum -0.3 |
| `flash_crash` | Flash Crash | ⚡💥 | major | -30% a -60% instantane, volatilite x3 |
| `mega_pump` | MEGA PUMP | 🚀🌙 | catastrophic | +150% a +400%, force phase euphoria |
| `coordinated_pump` | Pump Coordonne | 🤝📈 | moderate | +30% a +80%, progression lineaire |
| `rug_pull` | RUG PULL | 🧹💀 | catastrophic | -70% a -95%, trading suspendu |

### 2. VOLATILITY (5 evenements) - Change COMMENT le prix bouge

| ID | Nom | Emoji | Severite | Description |
|----|-----|-------|----------|-------------|
| `volatility_storm` | Tempete de Volatilite | 🌪️📊 | moderate | Volatilite x4, prix yo-yo |
| `dead_cat_bounce` | Dead Cat Bounce | 🐱💀📈 | moderate | Rebond +20-50%, puis rechute |
| `calm_before_storm` | Calme Avant la Tempete | 😶🌫️ | minor | Volatilite x0.1, puis explosion |
| `momentum_reversal` | Retournement de Momentum | 🔄⚡ | moderate | Inverse le momentum |
| `quantum_uncertainty` | Incertitude Quantique | ⚛️❓ | major | Prix cache jusqu'au trade |

### 3. TIMING (4 evenements) - Manipule les phases

| ID | Nom | Emoji | Severite | Description |
|----|-----|-------|----------|-------------|
| `phase_accelerator` | Accelerateur de Phase | ⏩🔥 | moderate | Phases 50% plus rapides |
| `phase_freeze` | Gel de Phase | 🧊⏸️ | moderate | Phase actuelle prolongee |
| `forced_transition` | Transition Forcee | ⚡🔀 | major | Saut vers phase aleatoire |
| `time_loop` | Boucle Temporelle | 🔁⏰ | major | Prix revient 5 min en arriere |

### 4. SPECIAL (7 evenements) - Mecaniques uniques

| ID | Nom | Emoji | Severite | Description |
|----|-----|-------|----------|-------------|
| `trading_halt` | Suspension des Echanges | 🚫💱 | major | Trading impossible, prix gele |
| `buy_frenzy` | Frenesie d'Achat | 🛒🔥 | moderate | 0% frais, prix monte |
| `panic_sell` | Vente Panique | 😱📉 | moderate | Frais x2, prix descend |
| `diamond_hands_bonus` | Bonus Diamond Hands | 💎🙌 | moderate | +5% DC gratuit pour holders |
| `paper_hands_tax` | Taxe Paper Hands | 📄🙌💸 | moderate | Frais de vente x2 |
| `whale_watching` | Surveillance des Baleines | 🔍🐋 | minor | Positions revelees |
| `communist_redistribution` | Redistribution Communiste | ☭🔄 | catastrophic | DC melanges aleatoirement |
| `mirror_dimension` | Dimension Miroir | 🪞🔄 | major | Prix evolue a l'inverse |

### 5. SCHEDULED (7 evenements) - Previsibles

| ID | Nom | Emoji | Intervalle | Warning | Description |
|----|-----|-------|------------|---------|-------------|
| `daily_lottery` | Loterie Quotidienne | 🎰🎲 | 24h | 1h | Un holder gagne 10% du DC total |
| `hourly_volatility_spike` | Pic Horaire | ⏰📊 | 1h | 5min | Volatilite x3 pendant 5min |
| `weekend_chaos` | Chaos du Weekend | 🎉🔥 | weekend | 30min | Volatilite x5, 0% frais |
| `halving` | Halving | ➗2️⃣ | 7j | 24h | DC /2, prix x2 |
| `burn_event` | Burn Event | 🔥💀 | 12h | 30min | 5% DC brule, prix monte |
| `airdrop` | Airdrop | 🎁✨ | random 24h | 10min | +10% DC pour holders |
| `market_open` | Ouverture du Marche | 🔔📈 | 24h | 5min | 15min de volatilite + 0% frais |

---

## Statistiques d'Equilibre

```
Total: 22 evenements

Par categorie:
- Market: 6 (27%)
- Volatility: 5 (23%)
- Timing: 4 (18%)
- Special: 7 (32%)
- Scheduled: 7 (32%)

Par severite:
- Minor: 3 (14%)
- Moderate: 12 (55%)
- Major: 5 (23%)
- Catastrophic: 3 (14%)

Par effet:
- Positifs (prix monte): ~8
- Negatifs (prix descend): ~8
- Neutres/Variables: ~6
```

---

## Interactions Phase-Evenements

Chaque evenement a des multiplicateurs par phase:

### Exemple: `mega_pump`
```typescript
phaseMultipliers: {
  accumulation: 1.5,  // Possible en accumulation
  markup: 2.5,        // TRES probable en markup
  recovery: 2.0,      // Probable en recovery
  euphoria: 0.3,      // Rare si deja en moon
  distribution: 0.2,  // Tres rare au top
  decline: 0.3,       // Rare en decline
  capitulation: 0.5,  // Possible en capitulation
}
```

### Logique:
- **Evenements positifs** plus probables en phases negatives (catch-up)
- **Evenements negatifs** plus probables en phases positives (correction)
- **Rug pull** TRES probable en euphoria (piege classique)
- **Dead cat bounce** TRES probable en capitulation

---

## Mecaniques Speciales

### 1. Quantum Uncertainty (⚛️❓)
```
Le prix affiche "???" jusqu'a ce qu'un joueur trade.
Le premier a trader "collapse" le prix a sa vraie valeur.
Cree de la tension: "Est-ce que ca vaut le risque?"
```

### 2. Dead Cat Bounce (🐱💀📈)
```
1. Prix rebondit +20-50%
2. Joueurs pensent "c'est le bottom!"
3. Apres la duree, triggerSecondaryDrop()
4. Prix rechute -30-50%
Piege classique des marches!
```

### 3. Calm Before Storm (😶🌫️)
```
1. Volatilite tombe a 10% du normal
2. Prix presque immobile
3. Message: "Le marche est etrangement calme..."
4. Apres la duree, EXPLOSION dans une direction aleatoire
```

### 4. Communist Redistribution (☭🔄)
```
1. Tous les DC sont collectes
2. Melanges aleatoirement (Fisher-Yates)
3. Redistribues aux memes joueurs
4. Le riche peut devenir pauvre et vice-versa!
```

### 5. Time Loop (🔁⏰)
```
1. Le prix revient a sa valeur d'il y a 5 minutes
2. Crée des opportunities d'arbitrage
3. "J'aurais du vendre il y a 5 min!" -> maintenant tu peux!
```

---

## Implementation UI

### Banner d'Evenement Actif
```tsx
<div 
  className="event-banner"
  style={{ 
    backgroundColor: event.color,
    animation: event.severity === 'catastrophic' ? 'pulse 0.5s infinite' : 'none'
  }}
>
  <span className="event-emoji">{event.emoji}</span>
  <span className="event-name">{event.name}</span>
  <span className="event-timer">{formatTime(timeRemaining)}</span>
</div>
```

### Warning Banner (evenements schedules)
```tsx
<div className="warning-banner" style={{ backgroundColor: '#ffaa00' }}>
  ⚠️ {event.warning}
  <span className="countdown">dans {formatTime(timeUntil)}</span>
</div>
```

### Indicateurs de Trading
```tsx
{!modifiers.tradingEnabled && (
  <div className="trading-disabled">🚫 TRADING SUSPENDU</div>
)}
{modifiers.feeMultiplier === 0 && (
  <div className="zero-fees">🎉 0% FRAIS</div>
)}
{modifiers.feeMultiplier > 1 && (
  <div className="high-fees">⚠️ FRAIS x{modifiers.feeMultiplier}</div>
)}
{!modifiers.priceVisible && (
  <div className="quantum-price">⚛️ PRIX: ???</div>
)}
```

---

## Recommandations d'Implementation

### 1. Tick Loop (chaque seconde)
```typescript
async function tickDahkaCoin() {
  const state = await getMarketState();
  const now = Date.now();
  
  // 1. Check scheduled events
  const { eventsToTrigger, eventsToWarn } = checkScheduledEvents(state.scheduledStates, now);
  
  // 2. Check random events (si pas d'event actif)
  if (state.activeEvent === 'none') {
    const trigger = checkForEventTrigger(state.phase, state.lastEventTime, now, state.activeEvent);
    if (trigger.triggered) {
      await startEvent(trigger.event, trigger.intensity, trigger.duration);
    }
  }
  
  // 3. Update active event
  if (state.activeEvent !== 'none') {
    await updateActiveEvent(state);
  }
  
  // 4. Calculate price with event modifiers
  const modifiers = calculateMarketModifiers(state.activeEvent);
  const priceChange = calculatePriceChange(state, modifiers);
  
  // 5. Save and broadcast
  await saveMarketState(state);
  await broadcastPriceUpdate(state);
}
```

### 2. Event Start Handler
```typescript
async function startEvent(event: DCEvent, intensity: number, duration: number) {
  // Announce
  await broadcastMessage(getEventAnnouncement(event, true));
  
  // Apply immediate effects
  if (event.effects.bonusForHolders) {
    await applyDiamondHandsBonus(event.effects.bonusForHolders);
  }
  if (event.effects.shuffleHoldings) {
    await shuffleHoldings();
  }
  
  // Update state
  await updateMarketState({
    activeEvent: event.id,
    eventStartTime: Date.now(),
    eventDuration: duration,
    eventIntensity: intensity,
  });
}
```

### 3. Event End Handler
```typescript
async function endEvent(event: DCEvent) {
  // Call special end handlers
  if (event.onEnd === 'triggerSecondaryDrop') {
    const result = await triggerSecondaryDrop(currentPrice, momentum);
    await applyPriceChange(result);
  }
  if (event.onEnd === 'triggerVolatilityExplosion') {
    const result = await triggerVolatilityExplosion(currentPrice, momentum);
    await applyPriceChange(result);
  }
  
  // Announce end
  await broadcastMessage(getEventAnnouncement(event, false));
  
  // Clear event state
  await updateMarketState({
    activeEvent: 'none',
    lastEventTime: Date.now(),
  });
}
```

---

## Sons et Animations

### Suggestions de sons:
- `crash`: Son de krach boursier (sirene)
- `moon`: Son de fusee
- `alarm`: Alarme d'urgence
- `lottery`: Son de jackpot
- `airdrop`: Son de cadeau
- `halving`: Son de division
- `revolution`: L'Internationale (joke)
- `transition`: Son de teleportation

### Animations CSS:
```css
@keyframes event-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.02); }
}

@keyframes event-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}

.event-catastrophic {
  animation: event-shake 0.3s infinite, event-pulse 1s infinite;
}

.event-major {
  animation: event-pulse 1s infinite;
}
```

---

## Testing Checklist

- [ ] Chaque evenement peut trigger
- [ ] Les cooldowns fonctionnent
- [ ] Les phase multipliers sont appliques
- [ ] Les effets speciaux (bonus, tax, shuffle) fonctionnent
- [ ] Les evenements schedules arrivent a l'heure
- [ ] Les warnings s'affichent avant les evenements schedules
- [ ] Le trading halt bloque vraiment le trading
- [ ] Le quantum price cache vraiment le prix
- [ ] Le dead cat bounce trigger bien la rechute
- [ ] Le calm before storm trigger bien l'explosion
- [ ] Le time loop revient bien 5 min en arriere
- [ ] La redistribution communiste melange bien les holdings
- [ ] La loterie donne bien le prix au gagnant
- [ ] Les sons jouent au bon moment
- [ ] Les animations sont fluides
- [ ] Pas de crash si 0 holders
- [ ] Pas de crash si evenement pendant evenement

---

## Conclusion

Ce systeme d'evenements transforme DahkaCoin d'un simple "prix monte/descend" en une experience de trading crypto complete avec:

1. **Variete**: 22 evenements uniques avec des mecaniques differentes
2. **Anticipation**: Evenements schedules avec warnings
3. **Surprise**: Evenements aleatoires imprevisibles
4. **Drama**: Rug pulls, redistributions, time loops
5. **Strategy**: Les joueurs peuvent anticiper certains evenements
6. **Balance**: Mix equilibre de positif/negatif/neutre
7. **Fun**: Des mecaniques memorables (quantum, communiste, dead cat)

Le chaos est controle mais excitant. Les joueurs ne savent jamais exactement ce qui va arriver, mais ils savent que quelque chose va arriver!
