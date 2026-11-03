# AlloCiné

> Exploration du 2026-11-03, sans compte connecté.
> Légende : ✅ vérifié sur le vrai site · 🔶 source tierce, non revérifié · ❓ à vérifier avec un compte connecté.

## Résumé

| Sujet | État |
|---|---|
| API officielle | Aucune API publique documentée |
| Lecture des notes | API GraphQL interne `graph.allocine.fr` (✅ opérations repérées dans le JS) ou page HTML du profil (🔶) |
| Écriture des notes | Mutations GraphQL internes `addUserOpinion` / `updateUserOpinion` (✅ repérées, ❓ non testées) |
| Authentification | Session du site (cookie ou jeton). Mécanisme exact ❓ |
| Échelle | 0,5 à 5, pas de 0,5 (✅ argument `rating: Float`, widget de 10 demi-étoiles) |
| Identifiants externes | Aucun ID IMDb/TMDB exposé. ID interne `Movie:<cfilm>` et identifiant EIDR dans le JSON-LD (✅) |
| CGU | **Bloquant potentiel** : extraction automatisée interdite (voir plus bas) |

## Identifiants

- Fiche film : `https://www.allocine.fr/film/fichefilm_gen_cfilm=<id>.html` ✅
- ID GraphQL (style Relay) : `base64("Movie:<id>")`, par exemple `TW92aWU6MTI1NTE=` pour La Haine (12551). Présent dans l'attribut `data-entity-id` des fiches ✅
- Le JSON-LD (`script[type="application/ld+json"]`) de la fiche contient `name`, `alternateName`, `titleEIDR`, `duration` (ISO 8601, par exemple `PT01H35M00S`), `director` et `genre` ✅
- Pas d'ID IMDb ni TMDB sur la fiche ✅

## Lecture

### Option A : GraphQL interne (recommandée, ❓ à confirmer)

- Hôte : `https://graph.allocine.fr`, lu dans `AC.config.hosts.graph` sur la page ✅. Le chemin exact (`/`, `/v1/...`) reste ❓ : un `POST` anonyme depuis la page vers `/`, `/v1/public` et `/v1/mobile` a échoué en CORS.
- Opérations présentes dans `moviepage.*.js` ✅ :
  - `GetUserOpinion($entityIds: [String]!)` → `me.user.social.entities(entity: $entityIds, action: [OPINION])`. Lit la note de l'utilisateur pour des films donnés. Utile pour `getExistingRating()`.
  - `GetUserSocialActionsForEntities(...)` : même principe, en lot.
  - `getUser` → `me.user { legacyId nickname ... }`. Utile pour `checkSession()`.
  - Fragment `UserEntityLeafFragment` : `entity { ... }` et `opinion { ... }`.
- L'opération qui liste **toutes** les notes de l'utilisateur, avec pagination, n'a pas été vue : elle ne charge pas sur une fiche film. Probablement sur `mon.allocine.fr/mes-films/vus/` ❓

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
- Aucun test d'écriture réalisé.
- On ne sait pas encore si `updateUserOpinion` sans `review` efface une critique existante ❓ **Point critique** avant toute écriture.

## Authentification

- Le site appelle `graph.allocine.fr` depuis la page. Le transport du jeton (cookie partagé `.allocine.fr` ou en-tête `Authorization`) reste ❓
- Approche prévue : exécuter les requêtes **depuis un onglet AlloCiné** (script de contenu), comme le fait le site. L'extension ne manipule alors jamais le jeton directement.

## Limites et protections observées

- Aucun en-tête de rate limit vu.
- Bannière de consentement (TCF) présente ✅. Aucun CAPTCHA rencontré pendant l'exploration.
- Délais utilisés par d'autres outils 🔶 : 1,2 s entre requêtes (allocine-to-trakt).

## Points fragiles

- Classes obfusquées et noms de classes générés (`Y6Y7qDPGTKlZvYR51Q8i`) : le scraping HTML cassera souvent.
- API GraphQL non documentée, susceptible de changer sans préavis.
- Les durées diffèrent selon les sites : AlloCiné indique 95 min pour La Haine, SensCritique 98 min. La durée n'est qu'un signal faible.
- Pas de date de notation connue (🔶 allocine-to-trakt).

## Conditions d'utilisation ⚠️

Source : <https://www.allocine.fr/service/conditions.html> (mise à jour du 16/05/2025).

- **Art. 7.5** : les données du site ne peuvent servir qu'à la consultation privée. Toute extraction, « substantielle ou non », est interdite.
- **Art. 8.1** : interdiction des systèmes automatisés (robot, spider, lecteur hors ligne) qui envoient plus de requêtes qu'un humain avec un navigateur standard. Interdiction aussi de constituer une base de données des services.
- **Art. 9** : suspension ou fermeture du compte possible sans avertissement.
- **Art. 6.1** : droit d'accès à ses données via `dpo-ac@webedia-group.com`. Les CGU ne mentionnent pas de portabilité, mais l'article 20 du RGPD s'applique.

**Lecture** : lire automatiquement ses propres notes reste une extraction automatisée au sens de l'art. 7.5. Un rythme « humain » réduit le risque lié à l'art. 8.1, mais pas celui lié à l'art. 7.5. Le risque concret est la suspension du compte AlloCiné.

**Alternative conforme** : demander à Webedia l'export RGPD de ses données, puis l'importer dans l'extension avec un adaptateur « fichier ». Le format de cet export est inconnu ❓

## Reste à vérifier (compte connecté)

1. URL exacte et mode d'authentification des requêtes `graph.allocine.fr`.
2. Opération et pagination de la liste complète des notes.
3. Champs disponibles par film : titre original, année, réalisateur, durée.
4. Comportement de `updateUserOpinion` vis-à-vis d'une critique existante.
5. Valeur minimale acceptée (0,5 ou 1).
