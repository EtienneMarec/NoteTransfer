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

## Pas encore vérifié

| Point | Pourquoi |
|---|---|
| Extension chargée dans Chrome | L'utilisateur n'a que Firefox |
| Rapport final exporté depuis Firefox | Pas encore transmis |
| Écriture réelle `ProductRate` et réponse exacte | Aucune écriture sans accord explicite |
| Bornes 1–10 de SensCritique | Au premier lot de test |
| Comportement après expiration du jeton SensCritique | Non provoqué |
| Reprise après suspension réelle du service worker | Testée en unitaire uniquement |

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
