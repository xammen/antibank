# AntiBank Deployment - Vercel + Partykit

Architecture finale : **Vercel (Web) + Partykit (Real-time WebSocket) + NeonDB (Database) + VPS (Discord Bot)**

---

## 🎯 Architecture

```
┌─────────────────┐
│  Discord Bot    │ ← VPS (ton serveur)
│  (VPS)          │
└────────┬────────┘
         │
         ↓
┌─────────────────────────────────────┐
│        NeonDB (PostgreSQL)          │
│     + Connection Pooling            │
└─────────┬───────────────────────────┘
          │
    ┌─────┴─────┐
    ↓           ↓
┌─────────┐  ┌──────────────────┐
│ Vercel  │  │   Partykit       │
│ (Web UI)│  │   (WebSocket)    │
│         │  │   Crash Game     │
└─────────┘  └──────────────────┘
```

**Pourquoi cette architecture ?**
- ✅ **100% gratuit** (free tiers suffisent)
- ✅ **Multiplayer real-time** fluide (WebSocket natif)
- ✅ **Scalable** : 50-100 joueurs simultanés sans problème
- ✅ **Déploiement simple** : 2 commandes

---

## 📦 Migration Effectuée

### 1. **Crash Game → Partykit**
- `apps/web/partykit/crash-game.ts` : Server WebSocket
  - Game loop (countdown, multiplier, crash)
  - Broadcast real-time à tous les joueurs
  - Gestion des bets/cashouts côté game state

### 2. **Client WebSocket**
- `apps/web/src/hooks/use-crash-game.tsx` : Hook React
  - Remplace le polling HTTP par WebSocket
  - `partysocket` pour connexion automatique
  - `placeBet()` et `cashOut()` envoient messages WebSocket

### 3. **Server Actions (Persistence)**
- `apps/web/src/actions/crash.ts` : Gère uniquement la DB
  - `placeCrashBet()` : Débite le compte
  - `cashOutCrash()` : Crédite les gains
  - Partykit gère le game state, server actions la persistance

---

## 🚀 Déploiement

### **Étape 1 : Deploy Partykit**

```bash
cd apps/web

# Se connecter à Partykit (créer compte sur https://partykit.io)
npx partykit login

# Deploy le serveur WebSocket
pnpm run party:deploy
```

**Résultat :** Tu obtiens une URL type `https://antibank.username.partykit.dev`

### **Étape 2 : Configurer Variables d'Env**

Créer `apps/web/.env.local` :

```bash
# Database (Neon pooling)
DATABASE_URL="postgresql://neondb_owner:npg_not6aBYbg0AL@ep-patient-lake-abs2u5we-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require"

# NextAuth
AUTH_SECRET="vAHoNS696XqJ_0-jvd0jaQV9XOEWuoxQ"
AUTH_DISCORD_ID="1456548704889602050"
AUTH_DISCORD_SECRET="8viuUAXOU5lKdZQU6wpHELuBZUoGkACcLtSWaOszpjU="
AUTH_URL="https://antibank.vercel.app"  # Sera mis à jour après deploy Vercel

# Partykit
NEXT_PUBLIC_PARTYKIT_HOST="antibank.username.partykit.dev"  # URL obtenue à l'étape 1
```

### **Étape 3 : Deploy Vercel**

```bash
cd apps/web

# Se connecter à Vercel
npx vercel login

# Deploy en production
npx vercel --prod
```

**Résultat :** Tu obtiens une URL type `https://antibank.vercel.app`

### **Étape 4 : Mettre à Jour AUTH_URL**

Sur Vercel dashboard (https://vercel.com/dashboard):
1. Projet **antibank** → Settings → Environment Variables
2. Modifier `AUTH_URL` avec l'URL finale : `https://antibank.vercel.app`
3. Redeploy (auto après changement de variable)

### **Étape 5 : Configurer Discord OAuth**

Discord Developer Portal (https://discord.com/developers/applications):
1. Ton application → OAuth2 → Redirects
2. Ajouter : `https://antibank.vercel.app/api/auth/callback/discord`
3. Save Changes

---

## 🧪 Test Local

**Terminal 1 - Partykit Dev Server:**
```bash
cd apps/web
pnpm run dev:party
# Démarre sur localhost:1999
```

**Terminal 2 - Next.js Dev Server:**
```bash
cd apps/web
pnpm run dev
# Démarre sur localhost:3000
```

**Terminal 3 - Discord Bot (VPS):**
```bash
cd apps/bot
pnpm run dev
```

Ouvrir `http://localhost:3000/casino/crash` et tester avec plusieurs onglets pour voir le multiplayer.

---

## 📊 Limites Free Tier

| Service | Limite Gratuite | Usage Estimé (100 users/jour) |
|---------|----------------|-------------------------------|
| **Vercel** | 100 GB bandwidth/mois | ~10 GB/mois ✅ |
| **Partykit** | 100k connexions/mois | ~30k/mois ✅ |
| **Partykit** | 1M messages/mois | ~500k/mois ✅ |
| **NeonDB** | 0.5 GB storage | ~50 MB ✅ |
| **NeonDB** | 3 GB transfer/mois | ~1 GB/mois ✅ |

**Verdict : Largement suffisant pour démarrer !**

---

## 🔧 Dépannage

### **Problème : WebSocket ne se connecte pas**
- Vérifier `NEXT_PUBLIC_PARTYKIT_HOST` dans `.env.local`
- Vérifier que Partykit server est déployé : `pnpm run party:deploy`
- Console navigateur → Network → WS pour voir la connexion

### **Problème : Bets ne se placent pas**
- Server action `placeCrashBet()` gère la DB
- Partykit gère le game state
- Vérifier les logs dans Console Vercel et Partykit dashboard

### **Problème : Joueurs ne voient pas les autres**
- Broadcast WebSocket depuis Partykit
- Vérifier `this.room.broadcast()` dans `crash-game.ts`

---

## 📈 Monitoring

### **Vercel Dashboard**
- https://vercel.com/dashboard
- Usage → Bandwidth, Serverless Function Executions

### **Partykit Dashboard**
- https://partykit.io/dashboard
- Connections, Messages, Rooms actifs

### **NeonDB Dashboard**
- https://console.neon.tech
- Storage, Data transfer, Connexions

---

## 🎮 Features Multiplayer

- ✅ **Voir les autres joueurs** en temps réel
- ✅ **Countdown synchronisé** pour tous
- ✅ **Multiplier monte en live** (10 fps)
- ✅ **Cashouts visibles** instantanément
- ✅ **Crash simultané** pour tous

**Latence estimée : <100ms** (Partykit edge deployed)

---

## 🔐 Sécurité

- ✅ Server actions vérifient session (`auth()`)
- ✅ Balance checks côté serveur (pas client)
- ✅ Partykit isole les rooms (un room = un game)
- ⚠️ **TODO:** Rate limiting sur bets (Upstash Redis)

---

## 🚧 Prochaines Étapes (Optionnel)

1. **Rate Limiting** : Upstash Redis free tier (10k req/jour)
2. **Analytics** : Vercel Analytics (gratuit)
3. **Monitoring** : Sentry (gratuit jusqu'à 5k events/mois)
4. **Custom Domain** : antibank.hiii.boo sur Vercel (gratuit)

---

## 💰 Coûts si Dépassement Free Tier

| Service | Prix/mois si upgrade |
|---------|---------------------|
| Vercel Pro | $20/mois (1 TB bandwidth) |
| Partykit Scale | $10/mois (1M connexions) |
| NeonDB Scale | $19/mois (3 GB storage) |

**Total worst case : $49/mois** (mais très peu probable avec 100-200 users)

---

**Ready to deploy!** 🚀
