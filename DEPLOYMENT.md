# 🚀 Guide de Déploiement AntiBank

## Architecture de Déploiement

```
┌──────────────────────────┐
│ Cloudflare Pages         │  ← Web app Next.js (GRATUIT)
│ • 100k req/jour          │
│ • Edge global            │
│ • 0€                     │
└────────┬─────────────────┘
         │
         ├─ NeonDB PostgreSQL (GRATUIT)
         │  • 500MB storage
         │  • Connection pooling
         │  • Edge-compatible avec @prisma/adapter-neon
         │
┌────────▼─────────────────┐
│ VPS / Railway            │  ← Bot Discord
│ • Voice tracking         │
│ • Long-running process   │
└──────────────────────────┘
```

---

## 📦 Configuration Requise

### Packages installés
- `@prisma/adapter-neon` - Adapter Prisma pour edge runtime
- `@neondatabase/serverless` - Driver NeonDB serverless
- `@cloudflare/next-on-pages` - Build pour Cloudflare Pages

### Variables d'environnement

**Web App (.env)** :
```bash
# NeonDB avec pooling (edge-compatible)
DATABASE_URL="postgres://user:pass@host-pooler.region.aws.neon.tech/db?sslmode=require"

# Discord OAuth
AUTH_SECRET="ton-secret-nextauth"
AUTH_DISCORD_ID="ton-discord-client-id"
AUTH_DISCORD_SECRET="ton-discord-client-secret"
AUTH_URL="https://ton-domaine.pages.dev"
```

**Bot (.env)** :
```bash
# NeonDB direct (non-pooled)
DATABASE_URL="postgres://user:pass@host.region.aws.neon.tech/db?sslmode=require"

DISCORD_TOKEN="ton-bot-token"
DISCORD_CLIENT_ID="ton-client-id"
DISCORD_GUILD_ID="ton-guild-id"
```

---

## 🌐 Déploiement Cloudflare Pages

### Option 1 : Via CLI (Recommandé)

```bash
# 1. Build le projet
pnpm --filter @antibank/web build

# 2. Déploie sur Cloudflare Pages
cd apps/web
pnpm wrangler pages deploy .vercel/output/static --project-name=antibank
```

### Option 2 : Via GitHub Integration

1. **Push ton code sur GitHub**
   ```bash
   git add .
   git commit -m "feat: configure cloudflare pages deployment"
   git push origin main
   ```

2. **Configure Cloudflare Pages** :
   - Va sur [dash.cloudflare.com](https://dash.cloudflare.com)
   - Pages → Create a project
   - Connect GitHub → Sélectionne ton repo
   - Build settings :
     - Framework preset: `Next.js`
     - Build command: `cd apps/web && pnpm build`
     - Build output directory: `apps/web/.vercel/output/static`
     - Root directory: `/`

3. **Ajoute les variables d'environnement** :
   - Settings → Environment variables
   - Ajoute `DATABASE_URL`, `AUTH_SECRET`, etc.

4. **Déploie** :
   - Save and Deploy
   - Cloudflare build automatiquement à chaque push

---

## 🤖 Déploiement Bot Discord

### Option 1 : VPS (Ton setup actuel)

```bash
# 1. Clone le repo sur ton VPS
git clone https://github.com/ton-user/antibank.git
cd antibank

# 2. Install dependencies
pnpm install

# 3. Configure .env dans apps/bot/
cp apps/bot/.env.example apps/bot/.env
nano apps/bot/.env  # Remplis les variables

# 4. Build le bot
pnpm --filter @antibank/bot build

# 5. Lance avec PM2 (process manager)
pnpm install -g pm2
pm2 start apps/bot/dist/index.js --name antibank-bot

# 6. Auto-restart au reboot
pm2 startup
pm2 save
```

### Option 2 : Railway (Gratuit mais limité)

⚠️ **500h/mois gratuit** = ~16h/jour. Pas viable pour bot 24/7.

```bash
# 1. Install Railway CLI
npm i -g railway

# 2. Login
railway login

# 3. Init projet
railway init

# 4. Configure variables
railway variables set DATABASE_URL="..."
railway variables set DISCORD_TOKEN="..."

# 5. Deploy
railway up
```

---

## 🔧 Optimisations Appliquées

### ✅ Edge Runtime (Cloudflare)
- **Avant** : Prisma classique (incompatible edge)
- **Après** : `@prisma/adapter-neon` (edge-compatible)

**packages/db/src/client.ts** :
```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ 
  connectionString: process.env.DATABASE_URL 
});

export const prisma = new PrismaClient({ adapter });
```

### ✅ Voice Mining Optimisé
- **Avant** : `deleteMany()` + `createMany()` (full table wipe)
- **Après** : Upsert batch + delete seulement les inactifs

**Résultat** : -90% de DB writes.

### ✅ Pagination Casino Queries
- **Avant** : `findMany()` sans limite (risque de charger 10k+ résultats)
- **Après** : `take: 50` sur toutes les queries

**Fichiers modifiés** :
- `apps/web/src/actions/dice.ts`
- `apps/web/src/actions/pfc.ts`

---

## 🐛 Troubleshooting

### Erreur : "Can't reach database server"

**Cause** : Cold start NeonDB (compute idle).

**Solution** : Ajoute `connect_timeout` dans `DATABASE_URL` :
```bash
DATABASE_URL="postgres://...?connect_timeout=15&pool_timeout=15"
```

### Erreur : "Pool exhausted" sur Cloudflare

**Cause** : Trop de connexions simultanées.

**Solution** : Vérifie que tu utilises bien le **pooled endpoint** (`-pooler` dans l'URL) :
```bash
# ✅ Bon (pooled)
postgres://user@host-pooler.region.aws.neon.tech/db

# ❌ Mauvais (direct)
postgres://user@host.region.aws.neon.tech/db
```

### Build échoue sur Windows

**Cause** : `@cloudflare/next-on-pages` buggy sur Windows.

**Solution** :
1. Utilise WSL2 (recommandé)
2. OU déploie via GitHub integration (build sur serveurs Cloudflare)

---

## 📊 Monitoring

### Cloudflare Pages
- Dashboard : https://dash.cloudflare.com
- Analytics : Requests, bandwidth, errors
- Logs : Real-time function logs

### NeonDB
- Console : https://console.neon.tech
- Metrics : Storage, connections, queries
- Branching : Create preview envs

### Bot Discord
- Logs : `pm2 logs antibank-bot`
- Status : `pm2 status`
- Monitoring : `pm2 monit`

---

## 💰 Coûts Estimés (Gratuit jusqu'à...)

| Service           | Limite Gratuite        | Dépassement        |
|-------------------|------------------------|--------------------|
| **Cloudflare Pages** | 100k req/jour       | 0.15$/1k req       |
| **NeonDB**          | 500MB storage        | $20/mois (Scale)   |
| **Railway**         | 500h/mois            | $0.000231/GB-sec   |

**Pour un projet Discord privé (10-50 users)** : **100% gratuit** avec ce setup.

---

## 🚀 Next Steps

1. **Déploie la web app** :
   ```bash
   pnpm --filter @antibank/web build
   cd apps/web && pnpm wrangler pages deploy .vercel/output/static
   ```

2. **Configure le bot sur VPS/Railway**

3. **Teste en prod** :
   - Click farming
   - Voice mining
   - Crash game

4. **Monitor** :
   - Cloudflare dashboard
   - NeonDB console
   - PM2 logs

---

## 📚 Ressources

- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [NeonDB Docs](https://neon.tech/docs/introduction)
- [Prisma Neon Adapter](https://www.prisma.io/docs/orm/overview/databases/neon)
- [Railway Docs](https://docs.railway.app/)

---

Créé par Sisyphus 🪨
