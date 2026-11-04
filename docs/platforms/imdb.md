# IMDb

> Exploration documentaire du 2026-11-03.
> Légende : ✅ vérifié · 🔶 source tierce · ❓ à vérifier.

## Résumé

| Sujet | État |
|---|---|
| API officielle | Aucune API grand public. L'offre de données d'IMDb est commerciale (sous licence) |
| Lecture | **Fichier** : export CSV officiel des notes (Your Ratings > ⋮ > Export) 🔶 |
| Écriture | Aucune méthode officielle. Au choix : API interne `rateTitle` (avertissement, ✅ vérifiée sur un compte de test) ou mode « à la main » |
| Échelle | Entiers 1 à 10 |
| IDs | `tt…` : c'est l'identifiant externe de référence |
| CGU | Robots, data mining et screen scraping explicitement interdits ✅ |

## Lecture par fichier 🔶

- Colonnes connues : `Const` (ID `tt…`), `Your Rating`, `Date Rated` (AAAA-MM-JJ), `Title`, `Original Title` ❓, `Year`, `Runtime (mins)`, `Directors`, `Title Type`, `URL`.
- C'est la meilleure source possible : chaque ligne porte l'ID IMDb. Vers Letterboxd ou Trakt, la correspondance sera exacte.
- Il faut confirmer les en-têtes sur un vrai export anonymisé. Ils ont changé au fil des années, avec par exemple un export asynchrone sur la page « Exports » ❓

## Implémentation (`src/adapters/imdb`)

- L'utilisateur choisit le CSV d'export. Les colonnes sont reconnues sans tenir compte de la casse ni de la ponctuation (`Const`, `Your Rating`, `Date Rated`, `Title`, `Original Title`, `Year`, `Runtime (mins)`, `Directors`, `Title Type`).
- Seuls les types « Movie », « TV Movie » et « Video » sont gardés : les séries sont ignorées en V1.
- L'ID `tt…` est conservé dans `externalIds.imdb` : la correspondance vers Letterboxd est donc exacte.
- **Tests** : sur l'export réel d'un compte de test (`__fixtures__/ratings.real-fr.csv`, où le type vaut « Film ») et sur une fixture synthétique (série, plusieurs réalisateurs).

## Écriture : deux modes au choix (décision du 2026-11-04)

IMDb n'a ni API publique d'écriture ni import officiel. L'utilisateur choisit :

### Automatique, par l'API interne (avertissement bloquant)

Vérifié sur un compte de test le 2026-11-04 :

- **Endpoint** : `POST https://api.graphql.imdb.com/`. Requêtes GraphQL en clair (pas seulement des requêtes persistantes), authentifiées par les **cookies du site** : `fetch` avec `credentials: 'include'` depuis un onglet `www.imdb.com`, sans en-tête particulier ✅
- **Écriture** : `mutation UpdateTitleRating($rating: Int!, $titleId: ID!) { rateTitle(input: {rating, titleId}) { rating { value } } }` (relevée sur le site lors d'un clic) ✅
  - `rating: 11` → `BAD_USER_INPUT` « Rating must be between 0 and 10 » ✅
  - **`rating: 0` SUPPRIME la note** ✅ : l'adaptateur n'envoie que des entiers de 1 à 10.
  - Noter deux fois un film remplace la note, sans doublon.
- **Note existante** : `title(id) { userRating { value } }` ✅. Sans session : `FORBIDDEN` « Authentication required but not provided » ✅, traité comme une déconnexion.
- **Recherche** : `mainSearch(first, options: { searchTerm, type: TITLE, titleSearchOptions: { type: [MOVIE] } })` renvoie l'ID, les titres, l'année, la durée et les réalisateurs ✅. Avec un ID IMDb connu (export IMDb, Letterboxd), l'adaptateur lit directement `title(id)`.
- **Bout en bout** : les 6 films AlloCiné (fixtures réelles) → IMDb avec le vrai adaptateur et le vrai moteur d'écriture. 3 créations (MIIB → 6, Moi moche et méchant → 5, Blair Witch → 10) et 3 notes identiques ignorées, toutes contre-vérifiées ensuite par une lecture directe ✅
- Chaque réponse de l'API rappelle : « Public, commercial, and/or non-private use of the IMDb data provided by this API is not allowed. » L'usage reste personnel, mais il s'agit bien d'automatiser le site, ce que les conditions interdisent : d'où l'avertissement.

### À la main (aucune requête vers IMDb)

- L'extension prépare la liste : film, note convertie, et lien vers la fiche exacte si l'ID IMDb est connu, sinon vers une recherche de films (`/find/?q=<titre original> <année>&s=tt&ttype=ft`).
- L'utilisateur note lui-même sur IMDb, puis coche « Fait » ou « Sauter ». Une coche peut être annulée.
- L'export IMDb actuel peut être ajouté pour écarter les films déjà notés (correspondances sûres uniquement).
- **Testé sur fixtures uniquement** (pipeline et interface, aucune requête réseau par conception).

## Conditions d'utilisation ✅

Source : <https://www.imdb.com/conditions>

- Interdiction du data mining, des robots, du screen scraping et des outils équivalents sans accord écrit.
- Licence limitée à un usage personnel et non commercial.
- Page d'aide sur l'usage des données (<https://help.imdb.com/article/imdb/general-information/can-i-use-imdb-data-in-my-software/G5JTRESSHJBBHTGX>) : un usage personnel et non commercial n'est autorisé qu'à partir des jeux de données officiels, et les robots et outils d'extraction sont interdits.
- Conséquences :
  - les permissions sur `www.imdb.com` et `api.graphql.imdb.com` ne sont demandées **que** pour le mode automatique ;
  - la lecture d'un export et le mode « à la main » n'envoient rien à IMDb ;
  - le mode automatique affiche un avertissement bloquant, qui mentionne aussi le compte Amazon souvent associé.
