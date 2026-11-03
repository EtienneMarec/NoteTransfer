# SensCritique

> Exploration du 2026-11-03, sans compte connecté.
> Légende : ✅ vérifié sur le vrai site · 🔶 source tierce, non revérifié · ❓ à vérifier avec un compte connecté.

## Résumé

| Sujet | État |
|---|---|
| API officielle | Aucune API publique documentée |
| Transport | GraphQL interne `https://apollo.senscritique.com/` (✅ appelé par le site, requête anonyme réussie) |
| Recherche | `searchAutocomplete` et `searchProductExplorer` (✅ testés en anonyme) |
| Lecture des notes | `user(username).collection(...)` → `otherUserInfos.rating` (🔶 SensBoxd) |
| Note existante | `product(id).currentUserInfos.rating` (✅ champ présent dans `ProductMainInfos`, ❓ valeur à voir connecté) |
| Écriture | Mutation `productRate(productId: Int!, rating: Int!)` : Product (✅ existe, vérifiée par validation sans exécution) |
| Suppression | `productUnrate(...)` : Boolean! ✅ |
| Authentification | Firebase (🔶), jeton transmis à `apollo` par un en-tête ❓ |
| Échelle | Entiers 1 à 10 (✅ `rating: Int`, ❓ bornes à confirmer) |
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

## Lecture des notes

- Opération `UserCollection` (🔶 SensBoxd) : `user(username: $username) { collection(action, universe, limit, offset, order, ...) { total products { ... otherUserInfos(username) { rating } } } }`, paginée par `offset`/`limit` (25 par défaut).
- Un profil public se lit sans authentification (SensBoxd envoie `Authorization: null`). Un profil privé demande une session ❓
- Fragment `ProductUserInfos` ✅ : `rating`, `isDone`, `isWished`, `dateDone`, `review { url }`, etc.

## Écriture

- `productRate(productId: Int!, rating: Int!)` renvoie un `Product` ✅. Vérification faite en envoyant une sélection volontairement invalide : le serveur rejette au stade de la validation, donc rien n'est exécuté. Il n'a pas signalé d'argument requis manquant, donc l'ancien `formatId` n'est plus obligatoire.
- La mutation n'apparaît pas dans les bundles JS chargés sur une fiche en anonyme : elle est chargée à la demande. Le nom d'opération et les variables exactes utilisés par le site restent ❓
- Vérification après écriture : relire `product(id).currentUserInfos.rating`.
- On ne sait pas si `productRate` marque aussi le film « vu » (`isDone`) ❓ C'est probable et sans conséquence pour la V1.

## Authentification

- 🔶 NitriKx/senscritique-graphql-api : connexion Firebase. Le jeton est ensuite envoyé à l'API GraphQL.
- ❓ Nom de l'en-tête (probablement `Authorization`) et emplacement du jeton côté navigateur (cookie ou stockage local).
- Approche prévue : exécuter les requêtes depuis un onglet `senscritique.com` (script de contenu). Le jeton reste dans le contexte du site, et Cloudflare voit une requête issue de la page.

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

## Reste à vérifier (compte connecté)

1. En-tête d'authentification envoyé à `apollo.senscritique.com` (nom uniquement, jamais la valeur).
2. Nom d'opération et variables exacts lors d'un clic sur une note.
3. Bornes de l'échelle (1 à 10 ?) et effet sur `isDone`.
4. `checkSession()` : requête `Me` avec la session courante.
