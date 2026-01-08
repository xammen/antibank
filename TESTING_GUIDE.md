# Guide de Tests - P2P Casino Rework

## Objectif
Tester tous les jeux P2P (Dice, PFC, Click-Battle) pour vérifier que les race conditions sont éliminées et que le rematch fonctionne.

## Prérequis
- Avoir 2+ comptes Discord de test
- L'app AntiBank déployée ou en dev local
- Au moins 10€ sur chaque compte

---

## Test 1: Dice 1v1 Challenge (Legacy)

### Scénario: Challenge Normal
1. **Joueur A**: Aller sur `/casino/dice`
2. **Joueur A**: Mode "pvp", sélectionner Joueur B, mise 1€, envoyer challenge
3. **Joueur B**: Aller sur `/casino/dice`, voir la notification de challenge
4. **Joueur B**: Cliquer "Accepter"
5. ✅ **Vérifier**: Les dés roulent pour les 2 joueurs en même temps
6. ✅ **Vérifier**: Les résultats s'affichent simultanément
7. ✅ **Vérifier**: Le gagnant reçoit les gains immédiatement

### Scénario: Double Accept (Race Condition Test)
1. **Joueur A**: Envoyer challenge à Joueur B
2. **Joueur B**: Ouvrir 2 onglets sur `/casino/dice`
3. **Joueur B**: Cliquer "Accepter" dans les 2 onglets **en même temps**
4. ✅ **Vérifier**: Un seul onglet accepte, l'autre affiche "déjà accepté"
5. ✅ **Vérifier**: Pas de double déduction de mise
6. ✅ **Vérifier**: La partie se joue normalement

### Scénario: Rematch
1. **Joueur A & B**: Terminer une partie de dés
2. **Joueur A**: Cliquer "rejouer" immédiatement
3. ✅ **Vérifier**: Une nouvelle challenge apparaît dans les challenges en attente
4. **Joueur B**: Voir la nouvelle challenge dans la liste (ne pas cliquer tout de suite)
5. **Joueur B**: Cliquer "rejouer" aussi
6. ✅ **Vérifier**: Joueur B voit la même challenge (code `RD{xxxxx}`)
7. **Joueur B**: Accepter la challenge
8. ✅ **Vérifier**: La partie démarre normalement

---

## Test 2: PFC 1v1 Challenge (Legacy)

### Scénario: Challenge Normal
1. **Joueur A**: Aller sur `/casino/pfc`
2. **Joueur A**: Mode "pvp", sélectionner Joueur B, mise 2€, envoyer challenge
3. **Joueur B**: Aller sur `/casino/pfc`, accepter challenge
4. **Joueur A & B**: Faire leurs choix (pierre/feuille/ciseaux)
5. ✅ **Vérifier**: L'animation démarre quand les 2 ont choisi
6. ✅ **Vérifier**: Les résultats s'affichent simultanément
7. ✅ **Vérifier**: Le gagnant reçoit les gains

### Scénario: Double Choice (Race Condition Test)
1. **Joueur A & B**: Challenge accepté, en mode "playing"
2. **Joueur A**: Ouvrir 2 onglets sur `/casino/pfc`
3. **Joueur A**: Cliquer "pierre" dans les 2 onglets **en même temps**
4. ✅ **Vérifier**: Un seul choix est enregistré
5. ✅ **Vérifier**: Pas de changement de choix après soumission

### Scénario: Rematch PFC
1. **Joueur A & B**: Terminer une partie PFC
2. **Les 2 joueurs**: Cliquer "rejouer" à quelques secondes d'intervalle
3. ✅ **Vérifier**: Les 2 voient la même challenge (code `RP{xxxxx}`)
4. **Le 2ème joueur**: Accepter la challenge
5. ✅ **Vérifier**: La partie démarre normalement

---

## Test 3: Click-Battle (GameRoom)

### Scénario: Quick Match
1. **Joueur A**: Aller sur `/casino/click-battle`
2. **Joueur A**: Quick Match, mise 5€, durée 10s
3. **Joueur B**: Quick Match avec les mêmes paramètres
4. ✅ **Vérifier**: Joueur B rejoint la room de Joueur A
5. **Les 2 joueurs**: Cliquer "Prêt"
6. ✅ **Vérifier**: Countdown 3s démarre
7. ✅ **Vérifier**: Le timer de 10s démarre en même temps pour les 2
8. **Les 2 joueurs**: Cliquer furieusement pendant 10s
9. ✅ **Vérifier**: Le timer s'arrête au même moment
10. **Les 2 joueurs**: Cliquer "Soumettre"
11. ✅ **Vérifier**: Les résultats s'affichent quand les 2 ont soumis
12. ✅ **Vérifier**: Le gagnant (+ de clics) reçoit les gains

### Scénario: Room Privée
1. **Joueur A**: Créer room privée, 3€, 8 joueurs max
2. **Joueur A**: Partager le code (ex: `ABC123`)
3. **Joueur B & C**: Joindre avec le code
4. ✅ **Vérifier**: Tous les joueurs voient la même liste
5. **Tous**: Cliquer "Prêt"
6. ✅ **Vérifier**: Countdown démarre quand tous sont prêts
7. **Tous**: Jouer et soumettre
8. ✅ **Vérifier**: Classement correct (ordre décroissant de clics)

---

## Test 4: Arena Multi-Joueurs (Dice/PFC)

### Scénario: Arena Dice 4 joueurs
1. **Joueur A**: Aller sur `/casino/arena`
2. **Joueur A**: Créer room publique, Dice, 2€, 4 joueurs max
3. **Joueurs B, C, D**: Quick Match Dice 2€
4. ✅ **Vérifier**: Tous rejoignent la même room
5. **Tous**: Cliquer "Prêt"
6. ✅ **Vérifier**: Countdown 15s démarre
7. ✅ **Vérifier**: À 0s, les dés roulent pour tous
8. ✅ **Vérifier**: Résultats affichés simultanément
9. ✅ **Vérifier**: Classement correct (ordre décroissant)

### Scénario: Arena PFC 3 joueurs
1. **Joueur A**: Créer room PFC, 1€, 3 joueurs
2. **Joueurs B & C**: Joindre la room
3. **Tous**: Prêt → Countdown → Faire choix
4. ✅ **Vérifier**: Animation démarre quand tous ont choisi
5. ✅ **Vérifier**: Résolution correcte (ex: si 2 pierre + 1 ciseaux → pierre gagne)

---

## Test 5: Race Conditions Critiques

### Test: Countdown Sync
1. **Joueur A & B**: Dans la même room (n'importe quel jeu)
2. **Les 2**: Observer le countdown en même temps
3. ✅ **Vérifier**: Les 2 affichent le même temps (±1s max)
4. ✅ **Vérifier**: Le jeu démarre au même moment pour les 2

### Test: Double Join
1. **Joueur A**: Créer room publique
2. **Joueur B**: Ouvrir 2 onglets
3. **Joueur B**: Cliquer "Joindre" dans les 2 onglets **en même temps**
4. ✅ **Vérifier**: Un seul onglet rejoint
5. ✅ **Vérifier**: Pas de double déduction de mise

### Test: Multiple Rematch
1. **Joueur A & B**: Terminer une partie
2. **Joueur A**: Spam "rejouer" 5 fois rapidement
3. **Joueur B**: Cliquer "rejouer" aussi
4. ✅ **Vérifier**: Une seule nouvelle challenge créée
5. ✅ **Vérifier**: Les 2 joueurs voient la même

---

## Métriques de Succès

### Performance
- [ ] Polling à 1s perceptible mais fluide
- [ ] Pas de lag visible entre joueurs
- [ ] Countdowns précis (±1s max de différence)

### Fiabilité
- [ ] 0 race condition détectée (pas de double-accept, double-join, etc.)
- [ ] 0 partie asymétrique (un joueur voit, l'autre non)
- [ ] 100% des rematches fonctionnent

### UX
- [ ] Notifications claires et immédiates
- [ ] Animations fluides et synchronisées
- [ ] Messages d'erreur explicites en français

---

## Bugs Connus à Surveiller

### Avant Fix (doivent être résolus maintenant)
- ❌ Notifications en retard → **Doit être instantané maintenant**
- ❌ Résultats asynchrones → **Doit être simultané**
- ❌ Game start asymétrique → **Doit démarrer pour tous**
- ❌ Rematch cassé → **Doit fonctionner à 100%**

### Si un bug persiste
1. Noter le scénario exact de reproduction
2. Vérifier les logs serveur (`pnpm dev` côté web)
3. Vérifier la console browser (F12)
4. Partager les détails pour debug

---

## Checklist Finale

### Build & Deploy
- [x] `pnpm build` → SUCCESS
- [x] Types valides
- [ ] Deployer sur Vercel
- [ ] Tester en production

### Tests Fonctionnels
- [ ] Dice 1v1 challenge → accept → play → rematch
- [ ] PFC 1v1 challenge → accept → choose → rematch
- [ ] Click-Battle quick match → play → submit
- [ ] Arena multi-joueurs (3+ personnes)

### Tests de Stress
- [ ] 5 challenges simultanés
- [ ] 10 joueurs dans une room
- [ ] Spam rematch button
- [ ] Double-accept avec 2 onglets

### Monitoring
- [ ] Vérifier les logs Vercel (erreurs?)
- [ ] Vérifier Prisma queries (pas de N+1?)
- [ ] Vérifier temps de réponse des actions (<500ms?)

---

**Bon test! Si tout passe, le système est production-ready.** 🚀
