# Ajouter une plateforme

Une plateforme = **un adaptateur**, plus son enregistrement et ses permissions. Le noyau (conversion, correspondance, file de requêtes, reprise, aperçu, rapport) ne change pas.

## 1. Explorer et documenter d'abord

Créez `docs/platforms/<nom>.md` sur le modèle des fiches existantes :

- méthodes de lecture et d'écriture (API officielle, API interne du site, fichier d'export ou d'import) ;
- authentification, pagination, échelle de notes, identifiants externes disponibles (IMDb, TMDB) ;
- limites observées, points fragiles ;
- **conditions d'utilisation** : toute restriction d'automatisation doit être signalée avant de coder.

Ne supposez jamais qu'un endpoint ou un champ existe : vérifiez-le sur le vrai site, et marquez chaque point « vérifié » ou « à vérifier ».

## 2. Déclarer les origines

Dans `src/core/permissions.ts`, ajoutez la plateforme à `HOST_PERMISSIONS` avec les origines strictement nécessaires. Elles deviennent automatiquement des `optional_host_permissions`, demandées seulement quand l'utilisateur choisit cette plateforme. Une plateforme qui fonctionne uniquement par fichiers n'a pas d'origine.

## 3. Écrire l'adaptateur

Créez `src/adapters/<nom>/` :

```
index.ts         l'objet PlatformAdapter
queries.ts       requêtes (GraphQL, URL d'API), avec la date de vérification
parse.ts         conversion des réponses vers le format pivot (fonctions pures)
__fixtures__/    réponses réelles anonymisées
<nom>.test.ts    tests sur les fixtures
```

L'interface complète est dans `src/core/adapter.ts`. Les points essentiels :

| Membre | Rôle |
|---|---|
| `capabilities.read` / `.write` | `'api'`, `'site'`, `'file'` ou `null`. L'interface ne propose que les transferts possibles. |
| `capabilities.scale` | Échelle native (`min`, `max`, `step`). La conversion est faite par le noyau. |
| `capabilities.termsWarning` | Avertissement bloquant à accepter avant le premier usage. |
| `capabilities.writeSideEffects` | Effets de bord d'une écriture, affichés dans l'aperçu. |
| Textes affichés (`notes`, `termsWarning`, `writeSideEffects`, consignes) | Type `Localized` : `{ fr, en }`. Les erreurs et raisons passent par `msg(clé, paramètres)` de `core/i18n.ts`. Un test échoue si une langue manque. |
| `site` | Pour `'site'` : page d'accueil, motifs d'onglet, cookie et en-tête d'authentification. Les requêtes sont exécutées depuis un onglet du site ; le jeton ne quitte jamais l'onglet. |
| `checkSession` | `ok`, `signed_out` (avec lien de connexion), `blocked` ou `needs_setup`. |
| `readRatings(ctx, cursor)` | Une page à la fois, avec un curseur sérialisable, pour reprendre après une suspension du service worker. |
| `searchFilm(ctx, query)` | Candidats avec le plus d'indices possible (titre original, année, réalisateurs, durée, IDs externes). Le score est calculé par le noyau. |
| `getExistingRating` | Note actuelle de l'utilisateur, ou `null`. Sert aux conflits, à l'idempotence et à la vérification après écriture : elle doit être fiable. |
| `writeRating(ctx, ref, value)` | `value` est déjà dans l'échelle de la plateforme. Une écriture doit être idempotente. |
| `parseUrl` / `getFilm` | Permettent à l'utilisateur de corriger une correspondance en collant l'adresse d'une fiche. |
| `parseExport` / `buildImportFiles` | Pour les plateformes par fichiers (`read: 'file'` / `write: 'file'`), avec `importInstructions`. |
| `manualWrite` | Mode « à la main » : `linkFor(work)` renvoie la fiche exacte ou une recherche, plus des instructions. Aucune requête n'est envoyée. Si l'adaptateur a aussi `write: 'site'`, l'interface propose le choix des deux modes. |
| `site.credentials` | `'include'` quand l'API est sur un autre domaine que la page et s'authentifie par les cookies du site (IMDb). `site.auth` est alors absent. |

Règles :

- **Ne faites jamais de `fetch` vous-même** : passez par `ctx.http.request` ou `gql(ctx, …)`. Le noyau gère la file par hôte, le délai aléatoire, le backoff, `Retry-After`, la détection de CAPTCHA et la pause.
- Levez `PauseError` pour ce qui doit arrêter tout le transfert (`signed_out`, `adapter_outdated`, `blocked`). Une erreur ordinaire ne fait échouer que la ligne en cours.
- Ne mettez dans le format pivot aucun identifiant qui révèle l'utilisateur.
- Gardez les requêtes minimales : un champ supprimé côté site ne doit casser que ce qui l'utilise.

## 4. Enregistrer

Ajoutez l'adaptateur à `ADAPTERS` dans `src/adapters/registry.ts`.

## 5. Tester

- **Fixtures** : réponses réelles, anonymisées (aucun pseudo, e-mail, identifiant d'utilisateur ni jeton). Indiquez leur origine et leur date dans un champ `_comment`.
- **Tests d'adaptateur** : requêtes envoyées (URL, variables), parsing, pagination, session absente, erreurs.
- **Bout en bout** : ajoutez un cas dans `src/core/job/pipeline.test.ts` si la plateforme apporte un comportement nouveau.
- **Sur le vrai site** : lecture d'abord, puis simulation complète, puis un lot de test de quelques films, **uniquement avec l'accord explicite du propriétaire du compte**. Consignez le résultat dans `docs/verification.md`.

Une fonctionnalité n'est terminée que lorsqu'elle a été testée, et la documentation doit dire si elle l'a été sur le vrai site ou seulement sur des fixtures.
