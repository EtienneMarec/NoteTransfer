# Journal de vérification

Chaque point est marqué ✅ réel (vérifié sur le vrai site), 🧪 fixtures (testé sur fixtures uniquement) ou ⏳ à faire.

## Vérifié sur le vrai site, sans compte (2026-11-03)

| Point | Résultat |
|---|---|
| SensCritique : endpoint GraphQL | ✅ `https://apollo.senscritique.com/`, appelé par le site |
| SensCritique : recherche anonyme `searchAutocomplete` | ✅ 200, résultats corrects (« La Haine » → id 472094) |
| SensCritique : détails `product(id)` | ✅ `duration` en secondes, `yearOfProduction`, `directors`, `originalTitle` |
| SensCritique : absence d'ID externes | ✅ `imdbId`, `tmdbId`, `externalIds` et `imdb` refusés par le schéma |
| SensCritique : mutation `productRate(productId, rating)` | ✅ existe, validation seule, aucune exécution |
| SensCritique : Cloudflare | ✅ script de challenge chargé |
| AlloCiné : hôte GraphQL | ✅ `https://graph.allocine.fr` (dans `AC.config.hosts.graph`) |
| AlloCiné : opérations `GetUserOpinion`, `addUserOpinion`, `updateUserOpinion`, `deleteUserOpinion`, `getUser` | ✅ présentes dans le JS de la fiche film |
| AlloCiné : ID d'entité `base64("Movie:<id>")` | ✅ |
| AlloCiné : obfuscation des liens (`ACr` + base64) | ✅ |
| AlloCiné : JSON-LD de la fiche (titre, durée, réalisateur, EIDR) | ✅ |

## Vérifié sur le vrai site, avec un compte connecté, en lecture seule (2026-11-03)

Comptes connectés par l'utilisateur dans le navigateur intégré. Aucune écriture, aucune valeur de cookie ou de jeton relevée.

| Point | Résultat |
|---|---|
| AlloCiné : endpoint et authentification | ✅ `POST graph.allocine.fr/v1/public`, `Authorization: Bearer` + cookie `GraphToken` |
| AlloCiné : liste paginée des notes | ✅ 6 films sur 2 pages, titre FR et original, année, durée, réalisateurs, note sur 5 |
| AlloCiné : date de notation | ✅ absente (`null`) |
| AlloCiné : indicateur de maintenance | ✅ `GET mon.allocine.fr/_/maintenance/social` → `false` |
| AlloCiné : texte de `AddOpinion` / `UpdateOpinion` | ✅ relevé dans le JS, ⏳ jamais exécuté |
| SensCritique : authentification | ✅ en-tête `authorization` = cookie `SC_AUTH` |
| SensCritique : session (`me`) | ✅ |
| SensCritique : note existante (`currentUserInfos`) | ✅ 8/10 connecté, `null` sans en-tête |
| SensCritique : collection de l'utilisateur | ✅ avec `rating` et `dateDone` |
| SensCritique : texte de `ProductRate` | ✅ relevé dans le JS, ⏳ jamais exécuté |

## Code des adaptateurs exécuté sur le vrai site, en lecture seule (2026-11-03)

Requêtes **exactes** des fichiers `src/adapters/*/queries.ts` et fonction `fetchFromPage` du pont de site, exécutées dans un onglet connecté du navigateur intégré. L'extension elle-même n'était pas chargée.

| Point | Résultat |
|---|---|
| AlloCiné `ME` | ✅ 200, pseudo renvoyé |
| AlloCiné `MOVIES_RATED` (`first: 30`) | ✅ 200, 6 films sur 6 |
| AlloCiné sans jeton | ✅ 401 `JWT Token not found`, traité comme « déconnecté » |
| SensCritique `ME`, `SEARCH`, `productDetails` (alias), `CURRENT_USER_RATING`, `COLLECTION` | ✅ 200, champs attendus, `url` présent |
| SensCritique `PRODUCT_RATE` | ✅ document **validé par le schéma sans exécution** (variable volontairement invalide → `BAD_USER_INPUT`) |
| **Simulation de correspondance** : 6 films AlloCiné (fixtures réelles) → `senscritique.searchFilm` + `decideMatch` + `getExistingRating` + `planRow` réels | ✅ 6/6 « sûr » et corrects (MIIB retrouvé via « Men in Black II » ; American History X à 1998/1999 confirmé par le réalisateur) ; 4 conflits conservés, 2 notes identiques, **0 écriture prévue** |

## Extension chargée dans Firefox, simulation complète (2026-11-03)

Test fait par l'utilisateur dans son Firefox, avec l'extension en module temporaire (`dist/firefox-mv3`) et ses sessions AlloCiné et SensCritique.

| Point | Résultat |
|---|---|
| Chargement, ouverture de l'application, demande d'accès aux sites, vérification des sessions | ✅ selon l'utilisateur (« fonctionne à merveille ») |
| Lecture AlloCiné → correspondance SensCritique → aperçu → simulation, via le vrai pont de site | ✅ selon l'utilisateur |
| Sauvegarde CSV exportée | ✅ fichier relu : 6 films, identifiants, URL, titres FR et originaux, années et notes sur 5 corrects ; aucun identifiant utilisateur ni jeton |

## Première écriture réelle (2026-11-03)

Transfert réel lancé par l'utilisateur dans Firefox : une seule ligne en conflit cochée volontairement pour écrasement, les autres conservées.

| Point | Résultat |
|---|---|
| `ProductRate` réel : « À bout de souffle » 6/10 → 7/10 (3,5/5 sur AlloCiné) | ✅ rapport : « réussi, enregistrée et vérifiée » |
| Contre-vérification indépendante sur le site après coup | ✅ `currentUserInfos.rating = 7`, `isDone: true`, `isWished: false` |
| Conflits non cochés conservés (MIIB 5, American History X 8, Forrest Gump 7) | ✅ « ignoré : note existante conservée » |
| Notes identiques ignorées (Moi, moche et méchant, Blair Witch) | ✅ « ignoré : déjà identique » |
| Rapport CSV exporté | ✅ colonnes et contenu corrects, aucun identifiant utilisateur ni jeton |

## Pas encore vérifié

| Point | Pourquoi |
|---|---|
| Extension chargée dans Chrome | L'utilisateur n'a que Firefox |
| Transfert réel de plusieurs films, lot de test puis « Continuer » | Une seule écriture faite |
| Création d'une note sur un film jamais noté (action `create`) | Le test était un écrasement |
| Comportement après expiration du jeton SensCritique | Non provoqué |
| Reprise après suspension réelle du service worker | Testée en unitaire uniquement |

## AlloCiné comme destination, compte de test (2026-11-03)

Code exact de l'adaptateur et du moteur d'écriture, exécuté dans un onglet AlloCiné connecté au compte de test (l'extension n'était pas chargée).

| Point | Résultat |
|---|---|
| `search(types: [Movie])` | ✅ schéma découvert par validation, résultats corrects (fixture réelle) |
| `movie(internalId)`, note existante avec `review` | ✅ |
| `addUserOpinion` : création, remplacement idempotent ; `updateUserOpinion` ; `deleteUserOpinion` | ✅ |
| Note invalide arrondie en silence par AlloCiné | ✅ constaté, désormais refusé localement |
| Export IMDb réel → AlloCiné : 3/3 « sûr », 2 identiques ignorés, La Haine créée à 4/5 et vérifiée | ✅ |
| Film avec critique | 🧪 refusé par l'adaptateur (non testé sur le site : il faudrait publier une critique) |
| Requête de lecture réécrite (`MOVIES_RATED`) | ✅ toujours acceptée, 7 films |
| **IMDb → AlloCiné dans l'extension chargée dans Firefox** (utilisateur, comptes de test) | ✅ rapport relu : « Clayface » (2026) créé à 4/5, enregistré et vérifié ; 3 notes identiques ignorées |

## Letterboxd et IMDb sur comptes de test (2026-11-03)

| Point | Résultat |
|---|---|
| Export IMDb réel (interface en français) | ✅ en-têtes confirmés ; **bug trouvé et corrigé** : « Title Type » vaut « Film », que l'ancien filtre anglais rejetait |
| Fichier d'import Letterboxd généré par l'adaptateur | ✅ 7/7 films correctement rapprochés par l'importeur, `imdbID` vide accepté ; import confirmé par l'utilisateur |
| Second import Letterboxd sur une note existante | ✅ remplacement **silencieux** constaté : parade ajoutée (export de la destination dans l'aperçu) |
| Export Letterboxd réel (ZIP) | ✅ `ratings.csv` = `Date,Name,Year,Letterboxd URI,Rating`, comme supposé |
| Détection des notes existantes à partir de l'export Letterboxd réel | 🧪 testée sur cet export réel : 5/6 films AlloCiné reconnus, « À bout de souffle » / « Breathless » non reconnu |
| Ces parcours dans l'extension chargée dans Firefox | ⏳ |

### Historique : avant les comptes de test

Aucun export réel n'avait été fourni, car l'utilisateur n'avait de compte ni Letterboxd ni IMDb. Les en-têtes viennent de la doc officielle de Letterboxd pour l'import et de sources tierces pour les exports : [guide IMDb → Hugo](https://jcktrue.dk/project/imdb-to-hugo-md/) et [importeur IMDb (Greasy Fork)](https://greasyfork.org/en/scripts/463836-imdb-ratings-importer/discussions/183933) pour IMDb, [analyse de données Letterboxd](https://julianegerez.github.io/blog/2023/06/11/Letterboxd) pour Letterboxd. Ces sources confirment les noms de colonnes, pas leur ordre exact. Pour limiter le risque, les lecteurs n'exigent que le strict minimum (`Const` et `Your Rating` pour IMDb, `Name` et `Rating` pour Letterboxd) et retrouvent les colonnes par leur nom, quel que soit leur ordre.

| Point | Tests | État |
|---|---|---|
| Lecteur CSV RFC 4180 et lecteur ZIP (stocké et deflate) | 5 | 🧪 |
| Lecture de l'export IMDb | 5 | 🧪 synthétique |
| Lecture de l'export Letterboxd (ZIP ou `ratings.csv`), génération du fichier d'import (échappement, IDs, découpage sous 1 Mo) | 9 | 🧪 synthétique |
| Pipeline IMDb → Letterboxd et AlloCiné → Letterboxd, dédoublonnage | 3 | 🧪 |
| Interface : choix du fichier, validation groupée, génération du fichier d'import | — | ⏳ compile, non testée dans Firefox |
| Import réel sur letterboxd.com | — | ⏳ |

## Noyau (tests unitaires uniquement, aucun site impliqué)

| Module | Tests | État |
|---|---|---|
| Conversion des notes (`core/convert.ts`) | 9 | 🧪 |
| Normalisation et score de correspondance (`core/match`) | 12, dont données réelles de La Haine | 🧪 |
| Client HTTP : file par hôte, délai aléatoire, backoff, Retry-After, pause (`core/http`) | 13 | 🧪 |
| Logger qui masque les secrets (`core/log.ts`) | 5 | 🧪 |
| Job persistant : lot de test, conflits, reprise sans doublon, simulation (`core/job`) | 16 | 🧪 |
| GraphQL : classement des erreurs, durées ISO (`core/graphql.ts`) | 6 | 🧪 |
| Adaptateur AlloCiné sur fixtures réelles | 9 | 🧪 |
| Adaptateur SensCritique sur fixtures réelles (écriture : réponse construite) | 7 | 🧪 |
| Pipeline lecture → correspondance → aperçu → simulation → rapport, sauvegarde | 8 | 🧪 |
| Pont de site : injection de l'en-tête depuis le cookie | 3 | 🧪 |
| Build Chrome MV3 et Firefox MV3 | — | ✅ compile, ⏳ non chargé dans un navigateur |

## À vérifier avec un compte connecté

Voir la section « Ce que j'ai besoin que tu vérifies » dans la réponse associée à ce plan, ou `docs/platforms/*.md`, rubrique « Reste à vérifier ».
