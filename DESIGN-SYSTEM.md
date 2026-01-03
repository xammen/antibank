# Direction Artistique - boo

Documentation complète de l'identité visuelle et du comportement du site.

---

## Philosophie de Design

### Esthétique Globale
- **Style** : Minimaliste tech, dark mode cyberpunk
- **Personnalité** : Mélange de ludique (emoji qui cligne) et professionnel (layout épuré)
- **Ton** : Décontracté, tout en minuscules, langage informel

### Principes
- Progressive disclosure (révélation progressive des informations)
- Feedback visuel constant sur les interactions
- Transitions fluides avec easing naturel
- Organisation spatiale guidée par des lignes de connexion

---

## Palette de Couleurs

| Rôle | Hex | Aperçu |
|------|-----|--------|
| Background | `#0a0a0a` | Noir profond |
| Texte principal | `#e0e0e0` | Gris clair |
| Texte secondaire | `#888` | Gris moyen |
| Hover/Selection | `#333` | Gris foncé |
| Lignes UI | `#555` | Gris intermédiaire |

### Sélection de texte
- Background : `#333`
- Texte : `#e0e0e0`

---

## Typographie

### Police
**JetBrains Mono** (auto-hébergée)

### Graisses
| Weight | Usage |
|--------|-------|
| 300 (Light) | Corps de texte par défaut |
| 400 (Regular) | Titres et emphases |

### Tailles
| Élément | Taille | Équivalent |
|---------|--------|------------|
| Titre (h1) | `1.1rem` | ~17.6px |
| Corps (p) | `0.85rem` | ~13.6px |
| En-tête outil | `0.85rem` | ~13.6px |
| Description outil | `0.75rem` | ~12px |

### Interligne
| Contexte | Line-height |
|----------|-------------|
| Corps | `1.8` |
| Descriptions | `1.6` |

---

## Espacements

| Élément | Valeur |
|---------|--------|
| Padding body | `2rem` (32px) |
| Padding top page | `20vh` |
| Largeur max contenu | `600px` |
| Marge entre paragraphes | `1rem` |
| Gap entre outils | `2rem` |
| Gap outil-description | `1.5rem` |

---

## Animations & Interactions

### Clignement du Visage
L'emoji `༼ つ ╹ ╹ ༽つ` cligne naturellement.

| Paramètre | Valeur |
|-----------|--------|
| États | Ouvert: `╹ ╹` / Fermé: `- -` |
| Durée du clignement | `120ms` |
| Intervalle | `3000ms - 8000ms` (aléatoire) |
| Double clignement | 30% de chance, délai de `250ms` |

### Rotation Flèche (Outil)
| Paramètre | Valeur |
|-----------|--------|
| Transition | `transform 0.2s ease` |
| Rotation ouverte | `rotate(180deg)` |

### Apparition Description
| État | Propriétés |
|------|------------|
| Initial | `opacity: 0`, `blur(4px)`, `translateX(5px)` |
| Visible | `opacity: 1`, `blur(0)` |
| Transition | `0.25s ease` |

### Animation des Lignes SVG

#### Ouverture
- **Durée** : `300ms`
- **Easing** : Cubic ease-out `1 - (1-t)³`
- **Comportement** : La ligne grandit du point de départ vers l'arrivée

#### Fermeture
- **Durée** : `300ms`
- **Comportement** : La ligne se rétracte vers le point de départ

#### Repositionnement
- **Durée** : `200ms`
- **Fluidité** : 60fps via `requestAnimationFrame`

### Hover
| Élément | Effet |
|---------|-------|
| En-tête outil | Couleur `#888` → `#e0e0e0` |

---

## Effets Spéciaux

### Lignes Pointillées (SVG)

| Propriété | Valeur |
|-----------|--------|
| Couleur | `#555` |
| Épaisseur | `1px` |
| Dasharray | `2, 2` |
| Opacité | `0.5` |
| Blend mode | `screen` |

Les lignes connectent visuellement les outils à leurs descriptions avec un effet de fondu subtil sur le texte.

### Transition Blur
Le texte des descriptions apparaît avec un effet de mise au point progressif (4px → 0px).

---

## Structure & Layout

```
Body (flexbox, centré)
├── Padding supérieur : 20vh
└── Main (max-width: 600px)
    ├── h1 (emoji visage)
    ├── Paragraphes
    └── Container Outils (position: relative)
        ├── SVG Canvas (lignes)
        ├── Flex Container Outils
        │   ├── CAF
        │   ├── Kmarks
        │   └── GIF
        └── Container Descriptions
            ├── Description CAF
            ├── Description Kmarks
            └── Description GIF
```

### Positionnement SVG
- Position : `absolute`, couvre tout le container
- Pointer-events : `none` (cliquable à travers)
- Z-index : `1` (entre outils et descriptions)

---

## Comportement Responsive

### Approche
- **Pas de media queries** : layout flexible avec `max-width`
- **Viewport** : `width=device-width, initial-scale=1.0`

### Gestion du Resize
- Recalcul des positions des descriptions
- Mise à jour des coordonnées SVG
- Ajustement dynamique de la hauteur du container
- Conservation de l'état des animations

---

## Flux d'Interaction

### Clic sur un Outil

1. Toggle de l'état `.open`
2. Annulation des animations en cours
3. **Si ouverture** :
   - Calcul des nouvelles positions
   - Mise à jour hauteur container
   - Animation des lignes existantes vers nouvelles positions
   - Après 10ms : animation de la nouvelle ligne
4. **Si fermeture** :
   - Retrait de `.visible`
   - Animation de fermeture de la ligne
   - Après 300ms : recalcul, masquage, update des lignes restantes

---

## Sécurité

### Content Security Policy
```
default-src 'self'
script-src 'self' 'unsafe-inline'
style-src 'self' 'unsafe-inline'
font-src 'self'
img-src 'self' data:
connect-src 'self'
frame-ancestors 'none'
```

### Headers de Sécurité
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`

---

## Fichiers

| Fichier | Rôle |
|---------|------|
| `index.html` | Page unique (HTML + CSS + JS inline) |
| `fonts/JetBrainsMono-Light.woff2` | Police light |
| `fonts/JetBrainsMono-Regular.woff2` | Police regular |
| `_headers` | Headers de sécurité Cloudflare |
| `wrangler.jsonc` | Config déploiement Cloudflare Workers |

---

## Statistiques

- **Taille HTML** : ~15.7 KB
- **Polices** : ~186 KB combinées
- **Animations** : 5 systèmes distincts
- **Couleurs** : 5 teintes
- **Breakpoints** : Aucun (flexbox adaptatif)
