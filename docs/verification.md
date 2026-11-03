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

## Noyau (tests unitaires uniquement, aucun site impliqué)

| Module | Tests | État |
|---|---|---|
| Conversion des notes (`core/convert.ts`) | 9 | 🧪 |
| Normalisation et score de correspondance (`core/match`) | 12, dont données réelles de La Haine | 🧪 |
| Client HTTP : file par hôte, délai aléatoire, backoff, Retry-After, pause (`core/http`) | 13 | 🧪 |
| Logger qui masque les secrets (`core/log.ts`) | 5 | 🧪 |
| Job persistant : lot de test, conflits, reprise sans doublon, simulation (`core/job`) | 16 | 🧪 |
| Build Chrome MV3 et Firefox MV3 | — | ✅ compile, ⏳ non chargé dans un navigateur |

## À vérifier avec un compte connecté

Voir la section « Ce que j'ai besoin que tu vérifies » dans la réponse associée à ce plan, ou `docs/platforms/*.md`, rubrique « Reste à vérifier ».
