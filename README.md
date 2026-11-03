# Notes Transfert

Extension de navigateur open source (Manifest V3, Chrome et Firefox) qui transfère vos notes de films d'une plateforme à une autre, par exemple d'AlloCiné vers SensCritique.

- **Tout est local** : l'extension utilise les sessions déjà ouvertes dans votre navigateur. Pas de serveur, pas de statistiques d'usage, pas de télémétrie.
- **Aucun mot de passe** n'est demandé ni stocké. Les cookies et jetons de session ne sont ni lus par l'extension, ni exportés, ni journalisés.
- **Rien d'incertain n'est écrit sans votre accord**, et une note déjà présente n'est jamais écrasée par défaut.

> **État : version 0.1, en développement.** Le parcours AlloCiné → SensCritique est complet et a été testé dans Firefox sur de vrais comptes : simulation complète et une première écriture réelle, vérifiée sur le site. Il n'a pas encore été testé dans Chrome, ni sur un transfert de plusieurs films. Voir [docs/verification.md](docs/verification.md).

## Plateformes

| Plateforme | Source | Destination | Méthode | État |
|---|---|---|---|---|
| AlloCiné | ✅ | — | API interne du site, depuis un onglet AlloCiné | Lecture vérifiée sur le vrai site |
| SensCritique | ✅ | ✅ | API interne du site, depuis un onglet SensCritique | Recherche, note existante et écriture vérifiées sur le vrai site (Firefox) ; la lecture comme source n'a été testée que par requête directe |
| Letterboxd | ✅ | ✅ | Fichiers officiels : export (ZIP ou `ratings.csv`) en entrée, fichier pour l'importeur en sortie | Testé sur fixtures synthétiques uniquement |
| IMDb | ✅ | ✗ | Fichier CSV d'export officiel (IMDb ne permet aucun import) | Testé sur fixture synthétique uniquement |
| Trakt | prévu | prévu | API officielle (OAuth) | Documenté |
| TMDB | prévu | prévu | API officielle (clé fournie par vous) | Documenté |

Le détail de chaque plateforme (méthodes, authentification, pagination, échelle, limites, points fragiles et CGU) est dans [docs/platforms/](docs/platforms/).

### Limites à connaître

- **AlloCiné** : ses CGU interdisent l'extraction automatisée de données (art. 7.5 et 8.1), et le site peut suspendre un compte sans préavis (art. 9). L'extension affiche cet avertissement et attend votre accord avant la première lecture. AlloCiné ne fournit pas de date de notation.
- **SensCritique** : noter un film le marque comme vu et le retire de vos envies.
- **Letterboxd** : l'extension génère le fichier, et c'est vous qui l'importez sur letterboxd.com/import. Letterboxd fait lui-même le rapprochement des films : par identifiant IMDb quand la source en fournit (export IMDb), sinon par titre, année et réalisateur. Ces lignes doivent donc être validées dans l'aperçu, puis vérifiées dans le récapitulatif de Letterboxd. Ce que fait Letterboxd d'une note déjà présente n'est pas documenté, et un import ne peut pas être annulé.
- **IMDb** : source uniquement, à partir de son fichier d'export. IMDb ne propose aucun import, et ses conditions interdisent d'automatiser le site.
- **Fichiers** : ils sont lus dans le navigateur et ne sont envoyés nulle part.
- AlloCiné et SensCritique n'utilisent pas d'API publique : un changement de leur site peut casser l'adaptateur. L'extension se met alors en pause avec le message « adaptateur obsolète » au lieu de continuer.
- Si un site affiche un CAPTCHA ou une vérification anti-robot, le transfert se met en pause et vous prévient. L'extension ne contourne jamais ces protections.

## Installation (mode développeur)

Prérequis : Node.js 20 ou plus récent.

```bash
npm install
```

```bash
npm run build
```

```bash
npm run build:firefox
```

- **Chrome / Edge** : ouvrez `chrome://extensions`, activez le « Mode développeur », cliquez sur « Charger l'extension non empaquetée » et choisissez `dist/chrome-mv3`.
- **Firefox (140 ou plus récent)** : ouvrez `about:debugging#/runtime/this-firefox`, cliquez sur « Charger un module complémentaire temporaire » et choisissez `dist/firefox-mv3/manifest.json`.

Développement avec rechargement automatique : `npm run dev` (Chrome) ou `npm run dev:firefox`.

## Utilisation

1. Connectez-vous normalement à AlloCiné et à SensCritique dans ce navigateur.
2. Cliquez sur l'icône de l'extension : l'application s'ouvre dans un onglet.
3. Choisissez la source et la destination. Le **mode simulation** est activé par défaut.
4. Cliquez sur « Autoriser l'accès et vérifier les sessions ». Le navigateur demande l'accès aux deux sites, et seulement à eux.
5. Lisez et acceptez l'avertissement AlloCiné, puis lancez la lecture. Les requêtes partent une à une, espacées de 2 à 4 s (réglable).
6. Dans l'**aperçu**, vérifiez chaque ligne : film, note source, note convertie, note existante, confiance et action prévue.
   - Les lignes « à vérifier » sont décochées : cochez-les pour valider, ou corrigez la correspondance (liste de candidats ou adresse de fiche collée).
   - Les conflits sont conservés par défaut : cochez une ligne pour l'écraser, ou changez la règle globale.
7. Téléchargez la **sauvegarde** (JSON + CSV). Elle est obligatoire avant une écriture réelle.
8. Lancez le **lot de test** (3 films par défaut), vérifiez le résultat, puis cliquez sur « Continuer ».
9. Exportez le **rapport** final (JSON + CSV) : réussites, ignorés, échecs et raisons.

**Avec un fichier** (IMDb ou Letterboxd en source) : à l'étape 3, choisissez le fichier d'export indiqué ; il n'y a pas de session à vérifier pour cette plateforme. **Vers Letterboxd** : à la place des étapes 7 et 8, cliquez sur « Générer le fichier d'import », puis suivez les instructions affichées pour l'importer sur le site.

Vous pouvez mettre en pause et reprendre à tout moment. Après une fermeture du navigateur, le transfert est mis en pause : cliquez sur « Reprendre ». Chaque ligne en cours est revérifiée sur le site avant toute nouvelle tentative, ce qui évite les doublons.

**Tout supprimer** (en haut de l'application) efface les transferts, les correspondances mémorisées et les réglages, puis retire les autorisations d'accès aux sites.

## Conversion des notes

La note d'origine et son échelle sont conservées. La conversion est proportionnelle (3,5/5 → 7/10), puis alignée sur le pas de la destination. Entre AlloCiné (0,5 à 5) et SensCritique (1 à 10), elle est toujours exacte. Quand elle ne l'est pas (TMDB à l'avenir), l'aperçu affiche l'ancienne note, la nouvelle et la règle d'arrondi choisie.

## Développement

```bash
npm test
```

```bash
npm run typecheck
```

- Architecture, modèle pivot et interface des adaptateurs : [docs/plan.md](docs/plan.md)
- Ajouter une plateforme : [docs/adding-a-platform.md](docs/adding-a-platform.md)
- Ce qui a été vérifié sur les vrais sites, et ce qui ne l'a été qu'avec des fixtures : [docs/verification.md](docs/verification.md)

## Licence

MIT.
