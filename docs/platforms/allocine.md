# AlloCiné

> Exploration du 2026-11-03 : d'abord sans compte, puis avec un compte connecté dans le navigateur intégré, en lecture seule.
> Légende : ✅ vérifié sur le vrai site · 🔶 source tierce, non revérifié · ❓ à vérifier.

## Résumé

| Sujet | État |
|---|---|
| API officielle | Aucune API publique documentée |
| Endpoint | `POST https://graph.allocine.fr/v1/public` ✅ |
| Lecture des notes | `GetMoviesSeen` → `me.user.social.relatedEntities.movies(action: [OPINION])`, pagination par curseur ✅ **testée connecté** |
| Écriture des notes | `addUserOpinion` (crée ou remplace) ✅ **testée sur un compte de test** |
| Recherche | `search(text, types: [Movie], first)` ✅ |
| Authentification | En-tête `Authorization: Bearer <valeur du cookie GraphToken>` ✅ |
| Échelle | 0,5 à 5, pas de 0,5 (✅ `rating(base: 5)` renvoie 2.5, 3.0, 4.5…) |
| Identifiants externes | Aucun ID IMDb/TMDB exposé. ID interne `Movie:<cfilm>` et identifiant EIDR dans le JSON-LD (✅) |
| CGU | **Bloquant potentiel** : extraction automatisée interdite (voir plus bas) |

## Identifiants

- Fiche film : `https://www.allocine.fr/film/fichefilm_gen_cfilm=<id>.html` ✅
- ID GraphQL (style Relay) : `base64("Movie:<id>")`, par exemple `TW92aWU6MTI1NTE=` pour La Haine (12551). Présent dans l'attribut `data-entity-id` des fiches ✅
- Le JSON-LD (`script[type="application/ld+json"]`) de la fiche contient `name`, `alternateName`, `titleEIDR`, `duration` (ISO 8601, par exemple `PT01H35M00S`), `director` et `genre` ✅
- Pas d'ID IMDb ni TMDB sur la fiche ✅

## Lecture

### GraphQL interne (retenue) ✅

- `POST https://graph.allocine.fr/v1/public`, corps `{query, variables}`. Hôte lu dans `AC.config.hosts.graph`, chemin relevé dans `website-common.*.js`.
- Opération utilisée par `mon.allocine.fr/mes-films/vus/` (`movies-seen.*.js`) : `GetMoviesSeen`, avec les variables `first: 30`, `types: [OPINION, REVIEW]`, `order: LATEST` et `brandCountry: FRANCE`.
- Requête minimale testée connecté, 6 films sur 2 pages :

  ```graphql
  query ($first: Int, $after: String) {
    me { user { social { relatedEntities {
      moviesSeen: movies(first: $first, after: $after, action: [OPINION], order: [LATEST]) {
        totalCount
        pageInfo { endCursor hasNextPage }
        edges { node {
          entity { __typename ... on Movie {
            id internalId title originalTitle data { productionYear } runtime
            credits(department: DIRECTION) { edges { node { person { firstName lastName } } } }
          } }
          opinion { id content { rating(base: 5) } }
        } }
      }
    } } } }
  }
  ```

- Champs obtenus ✅ : `title` (titre FR), `originalTitle`, `data.productionYear`, `runtime` (ISO 8601, ex. `PT1H30M0S`), réalisateurs, `rating` sur 5.
- `content.updatedAt` et `content.createdAt` valent `null` : **pas de date de notation** ✅
- Pagination : le curseur `endCursor` est un offset en base64 (`arrayconnection:2`). `first: 200` est accepté sur un compte de 6 films ; la limite réelle est inconnue, on garde 30 comme le site.
- Fixtures : `src/adapters/allocine/__fixtures__/movies-seen-page{1,2}.json`.
- Autres opérations présentes ✅ : `GetUserOpinion($entityIds)` (note pour des films donnés, utile pour `getExistingRating`) et `getUser` → `me.user { legacyId nickname }` (utile pour `checkSession`).

### Option B : HTML du profil (repli)

- Routes trouvées dans `https://www.allocine.fr/_/js/routing` ✅ :
  - `userprofile_movies_seen_list` → `https://www.allocine.fr/membre-<userId>/films/` (profil public)
  - `userspace_my_movies_seen` → `https://mon.allocine.fr/mes-films/vus/` (espace connecté)
- Sélecteurs selon RatS 🔶 : cartes `div.userprofile-entity-card-simple`, lien `a.meta-title-link`, note = nombre de `div.active` dans `div.user-rating-holder`, pagination `div.pagination-item-holder`, 36 films par page.
- Les liens sont **obfusqués** ✅ : une classe comme `ACrL2ZACrpbG0v...` remplace le `href`. Pour retrouver l'URL, on retire les `ACr`, puis on décode en base64 : on obtient `/film/fichefilm_gen_cfilm=12551.html`.

## Recherche de film (pour AlloCiné comme destination)

- `https://www.allocine.fr/rechercher/movie/?q=<titre>` ✅ : 20 cartes `.entity-card` par page. Chaque carte contient le titre (`.meta-title-link`), la date de sortie FR (`.date`), « De <réalisateur> », « Avec ... » et, si différent, « Titre original ... ».
- `robots.txt` interdit `/rechercher/` aux robots ✅. Ce n'est pas une contrainte juridique pour un usage personnel, mais c'est un signal de plus.

## Écriture

- Mutations présentes dans `moviepage.*.js` ✅ :
  - `addUserOpinion(input: {id_entity, rating: Float, review: String})`
  - `updateUserOpinion(input: {id_entity, rating, review})`
  - `deleteUserOpinion(input: {id_entity})`
- Texte exact utilisé par le site (`movies-seen.*.js`) ✅ :
  `mutation AddOpinion($entityId: String!, $rating: Float, $review: String, $isReview: Boolean!, $brandCountry: CountryCode!) { addUserOpinion(input: {id_entity: $entityId, rating: $rating, review: $review}) { ...MutationResponseFragment } }`. `UpdateOpinion` est identique, avec `updateUserOpinion`.
- Le site n'envoie `review` que s'il y a une critique.
- Avant toute mutation, le site interroge `GET https://mon.allocine.fr/_/maintenance/social`, qui renvoie `{"socialApiMaintenance": false}` ✅. L'adaptateur fera de même.
- Aucune écriture réalisée.
- Il faut encore vérifier si `updateUserOpinion` sans `review` efface une critique existante ❓ **Point critique** avant d'utiliser AlloCiné comme destination. Ça ne concerne pas le flux AlloCiné → SensCritique.

## Authentification ✅

- Le client GraphQL du site ajoute `Authorization: Bearer <jeton>`. Le jeton est lu dans le cookie dont le nom est donné par `AC.config.userspace.graphTokenCookieName` (`GraphToken`), présent une fois connecté.
- Pas de session : cookie absent → `checkSession()` renvoie `signed_out`.
- Le site gère les erreurs 401 (`isUnauthorized` sur `code === 401`).
- Approche retenue : le script de contenu d'un onglet AlloCiné lit le cookie et envoie la requête depuis la page. Le jeton ne quitte jamais l'onglet : il n'est ni renvoyé au background, ni stocké, ni journalisé.

## Limites et protections observées

- Aucun en-tête de rate limit vu.
- Bannière de consentement (TCF) présente ✅. Aucun CAPTCHA rencontré pendant l'exploration.
- Délais utilisés par d'autres outils 🔶 : 1,2 s entre requêtes (allocine-to-trakt).

## Points fragiles

- Classes obfusquées et noms de classes générés (`Y6Y7qDPGTKlZvYR51Q8i`) : le scraping HTML cassera souvent.
- API GraphQL non documentée, susceptible de changer sans préavis.
- Les durées diffèrent selon les sites : AlloCiné indique 95 min pour La Haine, SensCritique 98 min. La durée n'est qu'un signal faible.
- Pas de date de notation (✅ `updatedAt` vaut `null`).
- Les identifiants de nœud (`node.id`) contiennent l'identifiant interne de l'utilisateur en base64 : ils ne doivent jamais apparaître dans un export ni dans une fixture.

## Conditions d'utilisation ⚠️

Source : <https://www.allocine.fr/service/conditions.html> (mise à jour du 16/05/2025).

- **Art. 7.5** : les données du site ne peuvent servir qu'à la consultation privée. Toute extraction, « substantielle ou non », est interdite.
- **Art. 8.1** : interdiction des systèmes automatisés (robot, spider, lecteur hors ligne) qui envoient plus de requêtes qu'un humain avec un navigateur standard. Interdiction aussi de constituer une base de données des services.
- **Art. 9** : suspension ou fermeture du compte possible sans avertissement.
- **Art. 6.1** : droit d'accès à ses données via `dpo-ac@webedia-group.com`. Les CGU ne mentionnent pas de portabilité, mais l'article 20 du RGPD s'applique.

**Lecture** : lire automatiquement ses propres notes reste une extraction automatisée au sens de l'art. 7.5. Un rythme « humain » réduit le risque lié à l'art. 8.1, mais pas celui lié à l'art. 7.5. Le risque concret est la suspension du compte AlloCiné.

**Alternative conforme** : demander à Webedia l'export RGPD de ses données, puis l'importer dans l'extension avec un adaptateur « fichier ». Le format de cet export est inconnu ❓

## AlloCiné comme destination (vérifié sur un compte de test, 2026-11-03)

- **Recherche** : `search(text: String!, types: [Movie], first: Int)` sur `graph.allocine.fr` renvoie un `searchResultsConnection` dont les nœuds `SearchResult { score node { … on Movie } }` donnent les mêmes champs que la liste des notes ✅. Le schéma a été découvert grâce aux messages de validation, sans rien exécuter. Le bon film n'est pas toujours en tête : MIIB arrive 4e pour « Men in Black II », d'où `first: 10`. Fixture : `__fixtures__/search-men-in-black-ii.json`.
- **Fiche** : `movie(internalId: Int)` (ou `id: String`) ✅, utilisée pour corriger une correspondance à partir d'une URL collée.
- **Note existante** : `me.user.social.entities(entity: [base64("Movie:<id>")], action: [OPINION])` → `opinion.content { rating(base: 5) review }` ✅
- **Écriture**, testée sur La Haine :
  - `addUserOpinion(input: {id_entity, rating})` crée la note. Appelée sur un film déjà noté, elle **remplace** la note sans doublon ✅. L'opération est donc idempotente.
  - `updateUserOpinion` modifie aussi la note ✅. `deleteUserOpinion` la supprime ✅.
  - **Une note invalide (3,3) est arrondie en silence (→ 3)** ✅ : l'adaptateur refuse localement toute note qui n'est pas un multiple de 0,5.
  - Le site interroge `GET mon.allocine.fr/_/maintenance/social` avant toute mutation, et l'adaptateur fait de même.
- **Critiques** : l'effet d'une mutation sans `review` sur une critique existante n'a pas été testé, car cela suppose de publier une critique publique. Par prudence, **l'adaptateur ne modifie jamais un film qui a une critique** et l'indique dans le rapport.
- **Bout en bout** : export IMDb réel → AlloCiné avec le vrai adaptateur et le vrai moteur d'écriture. Les 3 films sont rapprochés de façon « sûre » ; 2 notes identiques sont ignorées, et La Haine (8/10 → 4/5) est **créée, relue et vérifiée** ✅

## Reste à vérifier

1. Taille de page maximale sur un gros compte.
2. Réponse quand le jeton a expiré : sans jeton, c'est un 401 `JWT Token not found` ✅ ; un jeton expiré n'a pas été testé.
