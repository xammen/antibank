#!/bin/bash
# Script de vérification post-déploiement AntiBank

set -e

# Couleurs pour output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# URL du déploiement (à remplacer après déploiement)
DEPLOYMENT_URL="${1:-https://antibank.pages.dev}"

echo "🔍 Vérification du déploiement AntiBank"
echo "URL: $DEPLOYMENT_URL"
echo ""

# Fonction de vérification HTTP
check_endpoint() {
    local endpoint=$1
    local expected_status=$2
    local description=$3
    
    echo -n "Vérification: $description... "
    
    status=$(curl -s -o /dev/null -w "%{http_code}" "$DEPLOYMENT_URL$endpoint" || echo "000")
    
    if [ "$status" = "$expected_status" ]; then
        echo -e "${GREEN}✓ OK${NC} (HTTP $status)"
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (HTTP $status, attendu $expected_status)"
        return 1
    fi
}

# Compteur d'erreurs
errors=0

# 1. Vérification page d'accueil
check_endpoint "/" "200" "Page d'accueil" || ((errors++))

# 2. Vérification API NextAuth
check_endpoint "/api/auth/signin" "200" "NextAuth signin" || ((errors++))

# 3. Vérification routes protégées (doivent rediriger)
check_endpoint "/dashboard" "307" "Dashboard (redirect)" || ((errors++))

# 4. Vérification API balance (doit être protégée)
check_endpoint "/api/balance" "401" "API balance (protected)" || ((errors++))

# 5. Vérification pages casino
check_endpoint "/casino" "200" "Page casino" || ((errors++))
check_endpoint "/casino/crash" "200" "Crash game" || ((errors++))
check_endpoint "/casino/dice" "200" "Dice game" || ((errors++))

# 6. Vérification shop
check_endpoint "/shop" "200" "Page shop" || ((errors++))

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $errors -eq 0 ]; then
    echo -e "${GREEN}✓ Tous les tests sont passés !${NC}"
    echo ""
    echo "🎉 Déploiement fonctionnel"
    echo ""
    echo "Prochaines étapes:"
    echo "1. Teste la connexion Discord OAuth"
    echo "2. Vérifie que le click farming fonctionne"
    echo "3. Teste le Crash game"
    echo "4. Vérifie les logs Cloudflare"
    exit 0
else
    echo -e "${RED}✗ $errors test(s) échoué(s)${NC}"
    echo ""
    echo "Débuggage recommandé:"
    echo "1. Vérifie les logs Cloudflare Pages"
    echo "2. Vérifie les variables d'environnement"
    echo "3. Vérifie que DATABASE_URL est bien configuré"
    echo "4. Vérifie que le build a réussi"
    exit 1
fi
