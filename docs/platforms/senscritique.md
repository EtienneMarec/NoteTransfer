# SensCritique

> Exploration du 2026-11-03 : d'abord sans compte, puis avec un compte connecté dans le navigateur intégré, en lecture seule.
> Légende : ✅ vérifié sur le vrai site · 🔶 source tierce, non revérifié · ❓ à vérifier.

## Résumé

| Sujet | État |
|---|---|
| API officielle | Aucune API publique documentée |
| Transport | GraphQL interne `https://apollo.senscritique.com/` (✅ appelé par le site, requêtes testées) |
| Recherche | `searchAutocomplete` et `searchProductExplorer` (✅ testés en anonyme) |
| Lecture des notes | `user(username).collection(universe: "movie", limit, offset)` → `otherUserInfos(username).rating` ✅ **testée connecté** |
| Note existante | `product(id).currentUserInfos.rating` ✅ **testée connecté** (`null` sans session) |
| Écriture | `mutation ProductRate($productId: Int!, $rating: Int!, $formatId: Int)` (✅ texte exact du site, ❓ jamais exécutée) |
| Suppression | `productUnrate(...)` : Boolean! ✅ |
| Authentification | En-tête `authorization: <valeur du cookie SC_AUTH>`, **sans** préfixe `Bearer` ✅ |
| Échelle | Entiers 1 à 10 (✅ `rating: Int`, valeurs observées 7, 8, 9 ; bornes à confirmer au lot de test) |
| Identifiants externes | **Aucun** : `imdbId`, `tmdbId`, `externalIds` et `imdb` sont refusés par le schéma ✅ |
| Protection | Cloudflare (script `challenge-platform` chargé sur les pages) ✅ |

## Identifiants

- URL : `https://www.senscritique.com/film/<slug>/<id>` ✅, par exemple `/film/la_haine/472094`.
- `product.universe` vaut `1` pour les films ✅.

## Recherche ✅

Requête anonyme testée depuis la page :

```graphql
query SearchAutocomplete($keywords: String!, $universe: String, $limit: Int) {
  searchAutocomplete(keywords: $keywords, universe: $universe, limit: $limit) {
    total
    items { product { id title originalTitle dateRelease dateReleaseOriginal universe url } }
  }
}
```

Avec `{keywords: "la haine", universe: "movie", limit: 5}`, la réponse est 200 avec 5 films. `originalTitle` vaut `null` quand il est identique au titre.

Détail d'un produit, testé en anonyme ✅ :

```graphql
{ product(id: 472094) { id title originalTitle yearOfProduction dateRelease duration universe directors { name } } }
```

Réponse : `duration: 5880` (**en secondes**), `yearOfProduction: 1995`, `directors: [{name: "Mathieu Kassovitz"}]`.

`searchProductExplorer(query, filters, sortBy, offset, limit)` existe aussi et renvoie le fragment `ProductList` et `currentUserInfos` ✅.

## Note existante ✅

```graphql
query ($id: Int!) { product(id: $id) { id currentUserInfos { rating isDone isWished dateDone review { url } } } }
```

Connecté : `{"rating": 8, "isDone": true, ...}`. Sans en-tête `authorization` : `currentUserInfos: null`. Fixture : `src/adapters/senscritique/__fixtures__/current-user-infos.json`.

## Lecture des notes ✅

- `query { me { username } }` donne le pseudo de la session.
- `user(username: $u) { collection(universe: "movie", limit: $limit, offset: $offset) { total products { id title originalTitle yearOfProduction duration directors { name } otherUserInfos(username: $u) { rating dateDone } } } }` renvoie les films, avec une **date** (`dateDone`), contrairement à AlloCiné.
- `total` vaut 568 sur le compte testé : la collection inclut probablement aussi les films vus sans note ou en envie. Il faudra filtrer par `action` (enum `ProductAction`, valeurs à lister) ou ignorer `rating: null`.

## Écriture

- Texte exact utilisé par le site (module chargé à la demande) ✅ :
  `mutation ProductRate($productId: Int!, $rating: Int!, $formatId: Int) { productRate(productId: $productId, rating: $rating, formatId: $formatId) { id currentUserInfos { ...ProductUserInfos } } }`
- La réponse optimiste du site met `isDone: true` et `isWished: false`. **Noter un film le retire donc des envies.** C'est à signaler dans l'aperçu.
- Vérification après écriture : relire `product(id).currentUserInfos.rating`.
- Jamais exécutée : le premier vrai test sera le lot de test, avec ton accord.

## Authentification ✅

- Le client Apollo du site ajoute `authorization: <cookie SC_AUTH>` quand un utilisateur est connecté. Il ajoute aussi `Apollo-Require-Preflight: true` pour les envois de fichiers (inutile ici).
- Le cookie `SC_AUTH` est lisible en JavaScript sur `www.senscritique.com`, donc accessible au script de contenu.
- En cas de code `UNAUTHENTICATED` ou `auth/unauthenticated-user`, le site recharge la page. L'adaptateur renverra `signed_out`.
- Approche retenue : le script de contenu d'un onglet `senscritique.com` lit le cookie et envoie la requête. Le jeton ne quitte jamais l'onglet.

## Limites observées

- Aucun en-tête de rate limit dans les réponses `apollo` ✅
- Réglages utilisés par SensBoxd 🔶 : 2 s minimum entre requêtes, 5 tentatives, backoff de base 4 s sur 429/502/503/504.
- Cloudflare peut afficher un challenge. Il faut le détecter (HTML au lieu de JSON, statut 403 ou 503, en-tête `cf-mitigated`), mettre en pause et prévenir l'utilisateur.

## Points fragiles

- API interne non documentée. Les noms d'opérations ont déjà changé (le schéma communautaire `critique_api` était différent).
- Le serveur valide strictement les requêtes : un champ supprimé fait échouer toute la requête. Les requêtes doivent rester minimales.
- Pas d'ID externe : la correspondance repose sur le titre, le titre original, l'année, le réalisateur et la durée.

## Conditions d'utilisation

Source : <https://senscritique.notion.site/Conditions-G-n-rales-d-Utilisation-7299753eb9a7458dacf185bc2aecc16a> (lien de `senscritique.com/cgu`).

- Pas de clause explicite sur les robots, le scraping ou l'automatisation ✅ (lecture complète des articles 1 à 11).
- **Art. 8** : « l'exploitation quelle qu'elle soit de tout ou partie de ce Site » est interdite sans autorisation expresse.
- **Art. 3** : suppression du compte possible en cas de non-respect des règles de conduite. Ces règles portent sur le contenu des publications.
- `robots.txt` interdit aux robots `/recherche`, `*.json` et `?page=` ✅

**Lecture** : noter ses propres films via l'API utilisée par le site n'est pas explicitement interdit, mais ce n'est pas autorisé non plus. Le risque est plus faible qu'avec AlloCiné, à condition de garder un rythme modéré.

## Reste à vérifier

1. ~~En-tête d'authentification~~ ✅
2. ~~Mutation exacte~~ ✅
3. Bornes de l'échelle (1 à 10) et réponse réelle de `ProductRate` : au lot de test.
4. ~~`checkSession()` via `Me`~~ ✅
5. Valeurs de l'enum `ProductAction` pour filtrer les films notés (seulement si SensCritique sert de source).
