# AGENTS.md - AntiBank

Guide rapide pour agents IA travaillant sur ce projet.

## Apercu du Projet

AntiBank est un ecosysteme economique fictif pour un groupe Discord. Cookie clicker + casino + systeme de braquages/votes.

**Stack**: Next.js 15 (App Router) + React 19 + Prisma 6 + PostgreSQL (NeonDB) + NextAuth v5 + TailwindCSS + Turbo monorepo

**Deploiement**: Vercel (web) | Custom (bot Discord)

## Structure Monorepo

```
antibank/
├── apps/
│   ├── web/          # Next.js 15 - Interface web
│   └── bot/          # Discord.js - Bot Discord
├── packages/
│   └── db/           # Prisma client + types partages
```

## Commandes Essentielles

```bash
# Dev
pnpm dev              # Lance tout via Turbo
pnpm dev --filter @antibank/web   # Web uniquement

# Build
pnpm build            # Build tout
pnpm lint             # Lint tout

# Database
pnpm db:generate      # Genere le client Prisma
pnpm db:push          # Push schema vers DB
pnpm db:studio        # Ouvre Prisma Studio

# Bot
pnpm --filter @antibank/bot dev   # Dev bot
pnpm --filter @antibank/bot deploy-commands  # Deploy slash commands
```

## Conventions de Code

### Imports (ordre strict)

```typescript
// 1. Libs externes
import { useState } from "react";
import Image from "next/image";

// 2. Packages internes
import { prisma } from "@antibank/db";

// 3. Alias locaux
import { auth } from "@/lib/auth";
import { Clicker } from "@/components/clicker";
import { clickBatch } from "@/actions/click";
```

### Nommage

| Element | Convention | Exemple |
|---------|------------|---------|
| Fichiers | kebab-case | `buy-upgrade.ts`, `voice-status.tsx` |
| Composants | PascalCase | `Clicker`, `ShopGrid` |
| Fonctions | camelCase | `calculateClickBonus`, `syncClicks` |
| Types/Interfaces | PascalCase | `ClickerProps`, `FloatingNumber` |
| DB Models | PascalCase | `User`, `CrashGame` |

### TypeScript

- **Strict mode** obligatoire
- Pas de `any`, `@ts-ignore`, `@ts-expect-error`
- Types explicites sur les parametres de fonctions
- `interface` pour les props, `type` pour les unions

```typescript
// BON
interface ClickerProps {
  userId: string;
  clickValue?: number;
}

// MAUVAIS
const handleClick = (e: any) => { ... }
```

### React Patterns

**Server Components** (defaut - pas de directive):
```typescript
// apps/web/src/app/page.tsx
import { auth } from "@/lib/auth";

export default async function Home() {
  const session = await auth();
  // ...
}
```

**Client Components** (interactivite):
```typescript
// apps/web/src/components/clicker.tsx
"use client";

import { useState, useCallback } from "react";
```

### Server Actions

```typescript
// apps/web/src/actions/click.ts
"use server";

import { prisma } from "@antibank/db";

export async function clickBatch(userId: string, count: number): Promise<ClickBatchResult> {
  // Toute la logique cote serveur
  // Validation + anti-triche + DB
}
```

### Gestion d'Erreurs

Messages d'erreur en francais, courts et informels:
```typescript
// BON
return { success: false, error: "trop rapide" };
return { success: false, error: "pas assez de thunes" };
return { success: false, error: "limite atteinte" };

// MAUVAIS
throw new Error("Rate limit exceeded");
```

### Database (Prisma)

- Tous les montants en `Decimal(10, 2)` - jamais de float
- Transactions pour operations monetaires critiques
- Upsert pour creation/mise a jour utilisateur

```typescript
// Transaction atomique
await prisma.$transaction(async (tx) => {
  await tx.user.update({ ... });
  await tx.transaction.create({ ... });
});
```

## Anti-Triche (CRITIQUE)

Le fichier `apps/web/src/actions/click.ts` contient la logique anti-triche:

- Max 20 clics par batch
- Max 3 batches par seconde
- Max 10 batches par 5 secondes
- Cooldown 30s si spam detecte
- Toute validation cote serveur, jamais confiance au client

## Architecture Cles

### Authentification
- NextAuth v5 avec Discord OAuth
- `auth()` dans Server Components/Actions
- Session enrichie avec `user.id`, `user.discordId`, `user.balance`

### Optimistic UI
Le clicker utilise des updates optimistes:
1. Update UI immediatement
2. Batch les clics (debounce 300ms)
3. Sync avec serveur
4. Reconcilie si erreur

### Casino
Models: `CrashGame`, `CrashBet`, `DiceGame`, `PFCGame`, `Lottery`
- Crash game avec multiplicateur aleatoire
- 5% taxe maison sur tous les gains

## Style UI

- **Theme**: Dark mode cyberpunk minimaliste
- **Font**: JetBrains Mono (300, 400)
- **Colors**: `#0a0a0a` (bg), `#e0e0e0` (text), `#888` (muted)
- **Ton**: Decontracte, tout en minuscules

CSS variables disponibles:
```css
var(--bg)          /* #0a0a0a */
var(--text)        /* #e0e0e0 */
var(--text-muted)  /* #888 */
var(--line)        /* #555 */
```

## Fichiers Importants

| Fichier | Role |
|---------|------|
| `apps/web/src/lib/auth.ts` | Config NextAuth + callbacks |
| `apps/web/src/actions/click.ts` | Logique clicker + anti-triche |
| `packages/db/prisma/schema.prisma` | Schema DB complet |
| `packages/db/src/upgrades.ts` | Definitions upgrades + calculs bonus |
| `antibank-specs.md` | Specs fonctionnelles completes |

## Checklist Avant Commit

- [ ] `pnpm db:generate` si schema modifie
- [ ] `pnpm lint` passe
- [ ] Pas de `console.log` en prod (sauf errors)
- [ ] Messages d'erreur en francais
- [ ] Types explicites, pas de `any`

## Roadmap Phases

1. ~~Auth + Dashboard + Clicker~~ (DONE)
2. ~~Casino (Crash, Des, PFC)~~ (DONE - UI partielle)
3. Braquages + Bounties
4. Votes + Justice
5. DahkaCoin (crypto fictive)
6. Boutique complete
7. Panel Admin
8. Events aleatoires

Voir `antibank-specs.md` pour specs detaillees.
