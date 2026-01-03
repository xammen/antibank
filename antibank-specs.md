# AntiBank - Spécifications Complètes

## 🎯 Résumé du Projet

AntiBank est un écosystème économique fictif et humoristique pour un groupe d'amis sur Discord. Il combine :
- Un **site web** avec cookie clicker et interfaces de jeu
- Un **bot Discord** pour les interactions rapides
- Un **panel admin** pour gérer et modérer le système
- Une **crypto fictive** (DahkaCoin) avec cours fluctuant aléatoirement

L'économie est basée en **Euros (€)** et les joueurs peuvent investir dans le **DahkaCoin (DC)**.

Le but : créer une économie fun où les joueurs peuvent s'enrichir, se voler, voter des amendes, parier au casino, et investir dans une crypto fake.

---

## 🏗️ Architecture Technique

```
┌─────────────────────────────────────────────────────────────────┐
│                         ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   👥 Joueurs                          🛡️ Admin                  │
│      │                                      │                   │
│      ▼                                      ▼                   │
│  ┌───────────┐    ┌───────────┐      ┌──────────────┐          │
│  │  Discord  │    │   Site    │      │ Panel Admin  │          │
│  │    Bot    │    │   Web     │      │   (séparé)   │          │
│  └─────┬─────┘    └─────┬─────┘      └──────┬───────┘          │
│        │                │                    │                  │
│        └────────────────┴────────────────────┘                  │
│                         │                                       │
│                         ▼                                       │
│              ┌─────────────────────┐                           │
│              │    API Backend      │                           │
│              │  (toute la logique) │                           │
│              └──────────┬──────────┘                           │
│                         │                                       │
│                         ▼                                       │
│              ┌─────────────────────┐                           │
│              │     Database        │                           │
│              │   (PostgreSQL)      │                           │
│              └─────────────────────┘                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Stack Technique
- **Frontend Site + Admin**: Next.js 14 (App Router) + Tailwind CSS + shadcn/ui
- **Backend API**: Next.js API Routes
- **Bot Discord**: Discord.js v14
- **Base de données**: PostgreSQL avec Prisma ORM
- **Temps réel**: WebSockets (Socket.io)
- **Auth**: Discord OAuth2 (obligatoire - chaque utilisateur doit lier son compte Discord)

---

## 🔐 Sécurité - PRIORITÉ MAXIMALE

### Authentification
- Discord OAuth2 obligatoire pour accéder au site
- Sessions sécurisées avec JWT (httpOnly, secure, sameSite: strict)
- Refresh tokens avec rotation automatique
- Expiration de session : 7 jours max, refresh après 1h d'inactivité

### Protection API
- Rate limiting strict sur toutes les routes :
  - Clics : 2 requêtes/seconde max
  - Actions économiques (braquage, achat, etc.) : 10 requêtes/minute
  - Auth : 5 tentatives/minute
- Validation de toutes les entrées avec Zod
- CORS configuré uniquement pour le domaine du site
- Headers de sécurité (Helmet.js) :
  - Content-Security-Policy
  - X-Frame-Options: DENY
  - X-Content-Type-Options: nosniff
  - Strict-Transport-Security

### Protection Base de Données
- Prepared statements uniquement (Prisma gère ça)
- Aucune donnée sensible en clair
- Transactions pour toutes les opérations monétaires
- Contraintes d'intégrité (solde >= 0, etc.)

### Anti-Triche
- Toute la logique métier côté serveur (jamais confiance au client)
- Vérification des cooldowns côté serveur
- Vérification des soldes avant chaque transaction
- Logs de toutes les actions pour audit
- Détection d'anomalies (trop de gains en peu de temps = flag)

### Protection contre les attaques courantes
- CSRF tokens sur tous les formulaires
- Protection XSS (sanitization des inputs)
- SQL Injection : impossible avec Prisma
- Brute force : rate limiting + blocage temporaire après X échecs

### Admin Panel
- Route séparée (/admin)
- Vérification du rôle admin côté serveur à chaque requête
- Liste blanche des Discord IDs autorisés en admin
- 2FA optionnel pour les actions critiques (reset, suppression)
- Logs de toutes les actions admin

---

## 💰 Économie de Base

### Revenus Passifs & Actifs

| Source | Montant | Condition |
|--------|---------|-----------|
| Idle passif | 0.02€/min | Toujours actif quand connecté au site |
| Clic manuel | 0.01€/clic | Max 100 clics/jour, cooldown 1 sec |
| Mining vocal | 0.05€/min | Être en vocal Discord avec min. 1 autre personne |
| Bonus vocal groupe | +0.02€/min/personne | Par personne supplémentaire en vocal |

### Paliers de Richesse et Effets

| Palier | Statut | Effet |
|--------|--------|-------|
| < 5€ | Clochard | Immunité aux braquages, éligible au RSA (0.50€/h), /beg disponible |
| 5€ - 50€ | Classe moyenne | Jeu normal, aucun modificateur |
| 50€ - 200€ | Bourgeois | Cible prioritaire des events négatifs |
| 200€ - 500€ | Riche | +10% chances de se faire braquer |
| > 500€ | Oligarque | -0.5% de solde par jour (frais de fortune) |

### Mécaniques de Rattrapage (pour les pauvres)
- `/beg` disponible uniquement si solde < 1€ (ouvre une cagnotte que les autres peuvent alimenter)
- RSA automatique : +0.50€/heure si solde < 5€
- Events "Investisseur providentiel" ciblent toujours le plus pauvre

---

## 🎰 Casino

### Règle Universelle
La maison prend 5% sur tous les gains. C'est un money sink.

### Crash Game
```
Mise minimum : 0.50€
Mise maximum : 10% de ta balance ou 50€ (le plus petit des deux)

Fonctionnement :
- Un multiplicateur monte de x1.00 en temps réel
- Le joueur doit "cash out" avant le crash
- Le crash arrive aléatoirement

Distribution des crashes :
- 50% des crashes avant x2
- 80% des crashes avant x5
- 95% des crashes avant x10
- 5% peuvent aller jusqu'à x50

Espérance mathématique : légèrement négative (maison gagne sur le long terme)
```

### Duel de Dés
```
Commande : /dice @adversaire [mise]

Règles :
- Les deux joueurs misent la même somme
- Chacun lance 2d6 (2 dés à 6 faces)
- Le plus haut total gagne tout le pot
- Égalité = remboursement moins 5% de frais
- Mise max : (plus petit solde des deux joueurs) / 2
```

### Pierre-Feuille-Ciseaux
```
Commande : /pfc @adversaire [mise]

Règles :
- Best of 1
- Mise identique des deux côtés
- Gagnant prend 95% du pot (5% taxe maison)
- Anti-spam : si 3 duels en 10 min entre mêmes joueurs, gains réduits de 50%
```

### Loterie Hebdomadaire
```
Ticket : 1€
Jackpot : toutes les mises + 20€ ajoutés par le système
Tirage : 1x par semaine
Probabilité de gagner : 1 / nombre de participants
```

---

## 🔫 Braquages

```
Commande : /rob @cible

Conditions :
- Cooldown : 3h entre chaque tentative
- La cible doit avoir minimum 20€
- Tu ne peux pas braquer quelqu'un qui a moins que toi

Calcul des chances de réussite :
- Base : 40%
- Pied-de-biche équipé : +15%
- Cible a un coffre-fort : -20%
- Cible a un gilet pare-balles : -15%
- Cible est 5x+ plus riche que toi : +10%

Si réussite :
- Tu voles 10-20% de sa balance (aléatoire)
- 5% du montant volé va au "système" (money sink)

Si échec :
- Tu perds 5% de TA balance (minimum 1€)
- La cible est notifiée
- La cible peut lancer un /bounty gratuit sur toi
```

---

## 🎯 Bounties

```
Commande : /bounty @cible [montant]

Fonctionnement :
- L'argent est bloqué en escrow
- Le premier joueur qui réussit un braquage sur la cible gagne la prime
- La prime expire après 48h (remboursé -10% frais)
- Bounty minimum : 1€

Anti-abus :
- Tu ne peux pas mettre un bounty sur toi-même
- Tu ne peux pas claim ton propre bounty
```

---

## ⚖️ Système de Votes & Justice

### Amendes par Vote
```
Commande : /warn @utilisateur [raison] [montant]

Contraintes :
- Montant minimum : 0.50€
- Montant maximum : 30% du solde de l'accusé (plafonné à 50€)
- Coût pour lancer un vote : 0.20€ (non remboursable)
- Durée du vote : 10 minutes
- Quorum : minimum 3 votants

Résultat si majorité "Coupable" :
- Amende appliquée
- 50% de l'amende répartie entre les votants "Coupable"
- 50% de l'amende détruite (money sink)

Résultat si majorité "Innocent" :
- L'accusateur paie 50% du montant demandé à l'accusé

Anti-abus :
- Maximum 1 warn par personne par 24h
- Tu ne peux pas warn quelqu'un qui a moins de 2€
- Tu ne peux pas voter sur ton propre warn
```

### Coup d'État
```
Commande : /revolution

Conditions pour lancer :
- Le plus riche doit avoir 3x plus que la médiane du serveur
- Coût pour initier : 3€
- Cooldown global : 48h (personne ne peut en lancer un autre avant)

Vote :
- Durée : 30 minutes
- Besoin de 60% des joueurs actifs pour que ça passe

Si réussite :
- Le plus riche perd 40% de sa fortune
- Redistribué également entre tous les votants "Pour"

Si échec :
- Tous les votants "Pour" perdent 10% de leur balance
- Le plus riche gagne 5% bonus
```

---

## 🎲 Dés Pipés & Accusations

### Dé Pipé
```
Prix : 10€
Durée : 3 utilisations
Effet : +15% de chances de gagner les duels de dés
Invisible aux autres joueurs
```

### Système d'Accusation
```
Commande : /accuse @joueur dés_pipés

Coût : 0.50€ pour lancer l'accusation
Le bot vérifie si le joueur a un dé pipé actif

Si coupable :
- Dé pipé confisqué
- Coupable paie 3€ d'amende + remboursement des 3 derniers duels
- Accusateur récupère ses 0.50€ + 1€ de prime

Si innocent :
- Accusateur perd ses 0.50€
- Accusateur paie 1€ de dommages à l'accusé
- Accusateur a un cooldown de 24h sur /accuse

Stratégie : tu peux acheter un dé pipé sans l'utiliser pour piéger les accusateurs
```

---

## 🏦 Prêts entre Joueurs

```
Commande : /loan @emprunteur [montant] [intérêt_%] [durée_jours]

Fonctionnement :
- L'emprunteur doit accepter le prêt
- Si pas remboursé à temps :
  - Saisie automatique de tout ce qu'il a
  - Dette reste inscrite (il ne peut pas emprunter ailleurs)
  - Le créancier gagne 2% par jour de retard
- Si l'emprunteur est à 0€ :
  - Ses gains passifs sont saisis à 50% jusqu'au remboursement

Limites :
- Intérêt maximum : 50%
- Montant maximum : 50% du solde du prêteur
- Un joueur peut avoir maximum 1 dette active
```

---

## 📈 DahkaCoin (Crypto Fictive)

### Fonctionnement
Le cours du DahkaCoin fluctue de manière 100% aléatoire (fake). Les joueurs peuvent investir leurs euros et espérer que ça monte.

### Variations du Cours
```
Update : toutes les 30 secondes

Variation normale : entre -5% et +5% par update

Événements rares (5% de chance par update) :
- Crash : -30% à -60%
- Pump : +30% à +80%

Tendances : le système génère des tendances aléatoires
- Durée : 1 à 4 heures
- Effet : entre -2% et +2% par update en plus de la variation normale

Limites :
- Prix minimum : 0.10€
- Prix maximum : 50€
```

### Actions Joueur
```
Investir :
- Gratuit (pas de frais)
- Tu donnes des € et reçois des DC au cours actuel

Retirer :
- Frais de 2% (money sink)
- Tu donnes des DC et reçois des € au cours actuel
```

### Affichage
- Graphique en temps réel (style TradingView simplifié)
- Historique sur 1h / 24h / 7j
- Affichage du profit/perte personnel

---

## 🛒 Boutique - Items

### Upgrades de Gains (stackables, max 3 de chaque)

| Item | Prix | Effet | Rentabilité |
|------|------|-------|-------------|
| Meilleure chaise | 15€ | +0.005€/min passif | Rentable après 50h |
| Deuxième écran | 25€ | +0.01€/min en vocal | Rentable après 42h vocal |
| Rig de minage | 50€ | +0.02€/min passif | Rentable après 42h |
| Datacenter | 150€ | +0.08€/min passif | Rentable après 31h |
| Assistant stagiaire | 40€ | Auto-clic 30x/heure | Rentable après 133h |

### Items Consommables

| Item | Prix | Durée/Charges | Effet |
|------|------|---------------|-------|
| Café premium | 2€ | 1 heure | x2 gains passifs |
| Gilet pare-balles | 8€ | 1 braquage | -50% pertes sur le prochain braquage subi |
| Pied-de-biche | 5€ | 3 utilisations | +15% réussite braquage |
| VPN | 15€ | 4 heures | Immunité aux braquages |
| Coffre-fort | 25€ | Permanent | Protège 20% du solde des braquages et events |
| Dé pipé | 10€ | 3 utilisations | +15% chances aux duels de dés |
| Avocat fiscaliste | 6€ | 1 utilisation | -50% sur la prochaine taxe/amende |
| Marteau du juge | 12€ | 24 heures | Ton vote compte double sur les amendes |
| Pot-de-vin | 20€ | 1 utilisation | Annule 1 amende votée contre toi |
| Insider trading | 18€ | 1 utilisation | Voit la tendance du DahkaCoin 5 min à l'avance |
| Audit surprise | 8€ | 1 utilisation | Déclenche un contrôle fiscal sur un autre joueur |

---

## 🌪️ Events Aléatoires

Les events se déclenchent aléatoirement. Probabilité : un event toutes les 2-6 heures environ.

| Event | Probabilité | Effet |
|-------|-------------|-------|
| Héritage surprise | 10% | Un joueur random (< médiane) reçoit 5€ |
| RSA exceptionnel | 8% | Tous les joueurs < 3€ reçoivent 1€ |
| Contrôle fiscal | 15% | Les 3 plus riches perdent 15% |
| Redistribution communiste | 5% | Tout le monde a maintenant la moyenne |
| Investisseur providentiel | 8% | Le plus pauvre reçoit 20% de ce qu'a le plus riche |
| DahkaCoin to the moon | 10% | Cours x10 pendant 15 minutes |
| Krach DahkaCoin | 10% | Cours /10 pendant 1 heure |
| Hyperinflation | 8% | Tous les prix de la boutique x3 pendant 6h |
| Hack de la banque | 3% | Tous les soldes sont mélangés aléatoirement |
| Panne du casino | 5% | Casino fermé pendant 3h |
| Fuite de données | 10% | Tous les soldes sont révélés publiquement (normalement cachés?) |
| Amnistie générale | 3% | Toutes les dettes sont effacées |
| Purge | 3% | Tous les items de tout le monde sont détruits |

---

## 🤖 Commandes Discord Bot

### Économie de base
- `/balance` - Voir ton solde
- `/leaderboard` - Classement des joueurs
- `/daily` - (optionnel) Bonus quotidien si tu veux en ajouter un

### Actions
- `/rob @cible` - Braquer quelqu'un
- `/gift @destinataire [montant]` - Donner de l'argent
- `/beg` - Mendier (ouvre une cagnotte si < 1€)

### Casino
- `/crash [mise]` - Jouer au crash game
- `/dice @adversaire [mise]` - Duel de dés
- `/pfc @adversaire [mise]` - Pierre-Feuille-Ciseaux
- `/lottery buy` - Acheter un ticket de loterie

### DahkaCoin
- `/dc price` - Voir le cours actuel
- `/dc buy [montant_euros]` - Investir
- `/dc sell [montant_dc]` - Retirer

### Justice
- `/warn @utilisateur [raison] [montant]` - Lancer un vote d'amende
- `/vote [coupable/innocent]` - Voter
- `/revolution` - Lancer un coup d'état
- `/accuse @joueur dés_pipés` - Accuser de triche

### Bounties & Prêts
- `/bounty @cible [montant]` - Mettre une prime
- `/loan @emprunteur [montant] [intérêt_%] [jours]` - Proposer un prêt
- `/repay` - Rembourser ta dette

### Boutique
- `/shop` - Voir la boutique
- `/buy [item]` - Acheter un item
- `/inventory` - Voir ton inventaire

---

## 🖥️ Interfaces Site Web

### Pages Joueur
1. **Dashboard** - Vue d'ensemble avec clicker, solde, notifications, leaderboard
2. **Casino** - Tous les jeux (Crash, Dés, PFC, Loterie)
3. **Braquage** - Liste des cibles, chances, bounties actifs
4. **Tribunal** - Votes en cours, lancer une amende, accusations
5. **DahkaCoin** - Graphique, investir/retirer, portfolio
6. **Boutique** - Acheter des items et upgrades
7. **Banque** - Prêts, dettes, historique des transactions
8. **Profil** - Stats personnelles, historique, inventaire

### Panel Admin
1. **Dashboard** - Stats globales, masse monétaire, activité temps réel
2. **Logs** - Historique de toutes les actions avec filtres, possibilité d'annuler (rollback)
3. **Joueurs** - Liste des joueurs, éditer solde/inventaire/cooldowns manuellement
4. **Events** - Déclencher un event manuellement, programmer des events
5. **Paramètres** - Configuration globale du jeu

---

## 💾 Schéma Base de Données (Prisma)

```prisma
model User {
  id              String   @id @default(cuid())
  discordId       String   @unique
  discordUsername String
  discordAvatar   String?
  
  balance         Decimal  @default(0) @db.Decimal(10, 2)
  dahkaCoins      Decimal  @default(0) @db.Decimal(10, 4)
  dcInvestedAt    Decimal? @db.Decimal(10, 2) // Prix moyen d'achat
  
  clicksToday     Int      @default(0)
  lastClickReset  DateTime @default(now())
  lastRobAttempt  DateTime?
  lastAccusation  DateTime?
  
  isAdmin         Boolean  @default(false)
  isBanned        Boolean  @default(false)
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  inventory       InventoryItem[]
  upgrades        UserUpgrade[]
  transactions    Transaction[]
  robsInitiated   Rob[]    @relation("RobAttacker")
  robsReceived    Rob[]    @relation("RobVictim")
  warnsInitiated  Warn[]   @relation("WarnInitiator")
  warnsReceived   Warn[]   @relation("WarnTarget")
  votes           Vote[]
  loansGiven      Loan[]   @relation("Lender")
  loansReceived   Loan[]   @relation("Borrower")
  bounties        Bounty[] @relation("BountyCreator")
  bountiesOn      Bounty[] @relation("BountyTarget")
}

model InventoryItem {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  itemType  String   // "gilet", "pied_de_biche", "vpn", etc.
  charges   Int      @default(1)
  expiresAt DateTime?
  createdAt DateTime @default(now())
}

model UserUpgrade {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  upgradeType String // "chaise", "ecran", "rig", etc.
  level     Int      @default(1) // max 3
  createdAt DateTime @default(now())
  
  @@unique([userId, upgradeType])
}

model Transaction {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  type        String   // "click", "passive", "vocal", "rob_gain", "rob_loss", "casino", "dc_buy", "dc_sell", "tax", "gift", "shop", "event", "warn", "loan"
  amount      Decimal  @db.Decimal(10, 2)
  description String?
  metadata    Json?    // Données supplémentaires selon le type
  
  reversedAt  DateTime? // Si annulé par admin
  reversedBy  String?   // Discord ID de l'admin
  
  createdAt   DateTime @default(now())
}

model Rob {
  id         String   @id @default(cuid())
  attackerId String
  attacker   User     @relation("RobAttacker", fields: [attackerId], references: [id])
  victimId   String
  victim     User     @relation("RobVictim", fields: [victimId], references: [id])
  success    Boolean
  amount     Decimal? @db.Decimal(10, 2) // Montant volé si succès
  createdAt  DateTime @default(now())
}

model Warn {
  id          String   @id @default(cuid())
  initiatorId String
  initiator   User     @relation("WarnInitiator", fields: [initiatorId], references: [id])
  targetId    String
  target      User     @relation("WarnTarget", fields: [targetId], references: [id])
  reason      String
  amount      Decimal  @db.Decimal(10, 2)
  status      String   @default("pending") // "pending", "guilty", "innocent", "expired"
  votesFor    Int      @default(0)
  votesAgainst Int     @default(0)
  expiresAt   DateTime
  createdAt   DateTime @default(now())
  
  votes       Vote[]
}

model Vote {
  id       String   @id @default(cuid())
  odrzerId String
  voter    User     @relation(fields: [voterId], references: [id])
  warnId   String
  warn     Warn     @relation(fields: [warnId], references: [id])
  vote     String   // "guilty" ou "innocent"
  createdAt DateTime @default(now())
  
  @@unique([voterId, warnId])
}

model Loan {
  id           String   @id @default(cuid())
  lenderId     String
  lender       User     @relation("Lender", fields: [lenderId], references: [id])
  borrowerId   String
  borrower     User     @relation("Borrower", fields: [borrowerId], references: [id])
  amount       Decimal  @db.Decimal(10, 2)
  interestRate Decimal  @db.Decimal(5, 2) // En pourcentage
  dueDate      DateTime
  status       String   @default("active") // "active", "repaid", "defaulted"
  repaidAt     DateTime?
  createdAt    DateTime @default(now())
}

model Bounty {
  id        String   @id @default(cuid())
  creatorId String
  creator   User     @relation("BountyCreator", fields: [creatorId], references: [id])
  targetId  String
  target    User     @relation("BountyTarget", fields: [targetId], references: [id])
  amount    Decimal  @db.Decimal(10, 2)
  status    String   @default("active") // "active", "claimed", "expired"
  claimedBy String?  // Discord ID du chasseur de prime
  expiresAt DateTime
  createdAt DateTime @default(now())
}

model DahkaCoinPrice {
  id        String   @id @default(cuid())
  price     Decimal  @db.Decimal(10, 4)
  createdAt DateTime @default(now())
}

model Event {
  id          String   @id @default(cuid())
  type        String   // "heritage", "tax", "redistribution", etc.
  description String
  metadata    Json?    // Détails de l'event
  createdAt   DateTime @default(now())
}

model GameConfig {
  key       String   @id
  value     Json
  updatedAt DateTime @updatedAt
}
```

---

## 🔄 Logique de Synchronisation

### WebSocket Events (Socket.io)

```javascript
// Events émis par le serveur
'balance:update'      // Quand le solde d'un joueur change
'leaderboard:update'  // Quand le classement change
'dc:price'            // Nouveau prix du DahkaCoin (toutes les 30s)
'notification'        // Notification personnelle (braquage, vote, etc.)
'vote:new'            // Nouveau vote lancé
'vote:update'         // Mise à jour d'un vote
'event:triggered'     // Un event aléatoire se déclenche
'casino:crash'        // Le crash game crash

// Events émis par le client
'click'               // Clic sur le cookie clicker
'casino:cashout'      // Cash out du crash game
```

### Mining Vocal Discord
```javascript
// Le bot check toutes les 60 secondes
// Pour chaque salon vocal avec 2+ personnes :
//   - Chaque membre gagne 0.05€ + (0.02€ * (nombre - 1))
//   - Enregistrer en DB avec type "vocal"
```

---

## 📝 Notes d'Implémentation

### Priorités de Développement
1. **Phase 1** : Auth Discord + Dashboard basique + Clicker + Solde
2. **Phase 2** : Casino (Crash, Dés, PFC)
3. **Phase 3** : Braquages + Bounties
4. **Phase 4** : Votes + Justice
5. **Phase 5** : DahkaCoin + Graphiques
6. **Phase 6** : Boutique + Items
7. **Phase 7** : Panel Admin
8. **Phase 8** : Events aléatoires + Polish

### Money Sinks (pour éviter l'inflation)
- 5% de taxe sur tous les gains casino
- 5% de frais sur les braquages réussis
- 2% de frais sur les retraits DahkaCoin
- Items consommables à racheter
- Coût pour lancer des votes/accusations
- 50% des amendes sont détruites
- 0.5%/jour pour les > 500€

### Points d'Attention
- Toujours utiliser des transactions DB pour les opérations monétaires
- Toujours vérifier les soldes AVANT de faire une action
- Logger TOUTES les actions pour pouvoir rollback
- Rate limiter agressivement pour éviter les abus
- Tester les edge cases (solde négatif, double-spend, etc.)
