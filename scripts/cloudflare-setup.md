# 🚀 Guide Cloudflare Pages Setup

## Étape 1 : Créer le projet Cloudflare Pages

### 1.1 Accéder au Dashboard
- **URL** : https://dash.cloudflare.com
- Menu gauche → **Workers & Pages**
- Cliquer sur **"Create application"**
- Sélectionner **"Pages"** → **"Connect to Git"**

### 1.2 Connecter GitHub
- Autoriser Cloudflare à accéder à GitHub (première fois)
- Sélectionner le repository : **`xammen/antibank`**
- Cliquer sur **"Begin setup"**

---

## Étape 2 : Configuration du Build

### 2.1 Paramètres du projet

```
Project name: antibank
Production branch: main
```

### 2.2 Build Configuration

**Framework preset** : `Next.js`

**Build command** :
```bash
npm install -g pnpm && pnpm install && pnpm --filter @antibank/db db:generate && pnpm --filter @antibank/web build
```

**Build output directory** :
```
apps/web/.next
```

**Root directory** : (laisser vide ou `/`)

**Node version** : `20.x` ou `latest`

---

## Étape 3 : Variables d'environnement

Cliquer sur **"Environment variables (advanced)"**

### Variables de production

| Variable | Valeur | Notes |
|----------|--------|-------|
| `DATABASE_URL` | `postgresql://neondb_owner:npg_not6aBYbg0AL@ep-patient-lake-abs2u5we-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require` | ⚠️ Change le mot de passe si exposé |
| `AUTH_SECRET` | Générer avec `openssl rand -base64 32` | **SECRET** - Ne jamais commit |
| `AUTH_DISCORD_ID` | Client ID de ton app Discord | Depuis Discord Developer Portal |
| `AUTH_DISCORD_SECRET` | Client Secret de ton app Discord | **SECRET** |
| `AUTH_URL` | `https://antibank.pages.dev` | Mettre après 1er déploiement |

**⚠️ IMPORTANT** : Le `DATABASE_URL` que j'ai mis contient un mot de passe visible. Si c'est sensible, **régénère-le sur NeonDB** avant de déployer.

---

## Étape 4 : Premier Déploiement

### 4.1 Lancer le build
- Cliquer sur **"Save and Deploy"**
- Attendre 2-5 minutes (build + déploiement)

### 4.2 Récupérer l'URL
Une fois terminé, Cloudflare affiche :
```
https://antibank-xxx.pages.dev
```

**Copier cette URL** pour l'étape suivante.

---

## Étape 5 : Configuration OAuth Discord

### 5.1 Mettre à jour AUTH_URL
- Retourner sur Cloudflare Pages → antibank → Settings → Environment variables
- Modifier `AUTH_URL` avec ton URL Cloudflare : `https://antibank-xxx.pages.dev`
- Save

### 5.2 Configurer Discord OAuth
1. Aller sur https://discord.com/developers/applications
2. Sélectionner ton application Discord
3. **OAuth2** → **Redirects**
4. Ajouter : `https://antibank-xxx.pages.dev/api/auth/callback/discord`
5. **Save Changes**

### 5.3 Redéployer
- Cloudflare Pages → View deployments → **Retry deployment**
- OU push un commit (auto-redeploy)

---

## Étape 6 : Vérification

### Automatique
Lance le script de vérification :
```bash
bash scripts/verify-deployment.sh https://antibank-xxx.pages.dev
```

### Manuelle
Teste ces URLs :

| URL | Attendu |
|-----|---------|
| `https://antibank-xxx.pages.dev/` | Page d'accueil OK |
| `https://antibank-xxx.pages.dev/api/auth/signin` | Page de connexion Discord |
| `https://antibank-xxx.pages.dev/dashboard` | Redirect vers login (pas connecté) |
| `https://antibank-xxx.pages.dev/casino/crash` | Page Crash game |

### Connexion Discord
1. Clique sur "se connecter" sur la page d'accueil
2. Autorise l'app Discord
3. Tu dois être redirigé vers `/dashboard`
4. Ton solde doit s'afficher

---

## Dépannage

### Build échoue : "pnpm not found"
**Solution** : Vérifie que le build command commence bien par :
```bash
npm install -g pnpm && ...
```

### Build échoue : "Cannot find @prisma/client"
**Solution** : Ajoute `pnpm --filter @antibank/db db:generate` au build command.

### Runtime error : "DATABASE_URL undefined"
**Solution** : Vérifie que `DATABASE_URL` est bien dans les Environment Variables (pas juste en local).

### Auth error : "Invalid redirect_uri"
**Solution** : Vérifie que le redirect URI Discord correspond EXACTEMENT à :
```
https://ton-url.pages.dev/api/auth/callback/discord
```

### Edge runtime error : "Pool is not a constructor"
**Solution** : Vérifie que `@prisma/adapter-neon` et `@neondatabase/serverless` sont bien installés.

---

## Logs & Monitoring

### Logs Cloudflare
- Dashboard → Workers & Pages → antibank → Logs
- Real-time function logs
- Filtrer par status code (400, 500, etc.)

### NeonDB Metrics
- Console NeonDB : https://console.neon.tech
- Operations → Metrics
- Surveille connections, queries, storage

---

## Domaine Personnalisé (Optionnel)

### Ajouter un domaine custom
1. Cloudflare Pages → antibank → Custom domains
2. **Add a custom domain**
3. Enter domain : `antibank.ton-domaine.com`
4. Cloudflare configure automatiquement DNS + HTTPS

### Mettre à jour Discord OAuth
- Ajouter le nouveau redirect : `https://antibank.ton-domaine.com/api/auth/callback/discord`
- Mettre à jour `AUTH_URL` dans les env vars

---

## Rollback en cas de problème

### Revenir à un déploiement précédent
1. Cloudflare Pages → antibank → Deployments
2. Cliquer sur le déploiement qui fonctionnait
3. **Rollback to this deployment**

---

## Auto-Deploy

Chaque push sur `main` déclenche automatiquement :
1. ✅ Build Next.js
2. ✅ Prisma generate
3. ✅ Deploy edge global
4. ✅ Invalidate cache

**Temps moyen** : 2-3 minutes.

---

## Checklist Finale

- [ ] Projet Cloudflare Pages créé
- [ ] GitHub connecté (repo `xammen/antibank`)
- [ ] Build settings configurés (pnpm + Prisma generate)
- [ ] Variables d'environnement ajoutées
- [ ] Premier déploiement réussi
- [ ] URL récupérée
- [ ] `AUTH_URL` mis à jour
- [ ] Discord OAuth redirect configuré
- [ ] Redéploiement effectué
- [ ] Tests manuels passés (auth, click, crash)
- [ ] Logs vérifiés (pas d'erreurs)

---

🎉 **Déploiement terminé !**

Ton app tourne maintenant sur l'edge global Cloudflare avec :
- ✅ 100k requêtes/jour gratuit
- ✅ Latence <50ms mondiale
- ✅ Auto-scaling illimité
- ✅ HTTPS automatique
- ✅ DDoS protection

**Coût** : 0€ jusqu'à 100k req/jour.
