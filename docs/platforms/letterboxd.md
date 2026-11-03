# Letterboxd

> Exploration documentaire du 2026-11-03.
> Légende : ✅ vérifié dans la doc officielle · 🔶 source tierce · ❓ à vérifier.

## Résumé

| Sujet | État |
|---|---|
| API officielle | Existe (`/api-beta/`), accès sur demande, non ouverte au public ❓ |
| Lecture | **Fichier** : export officiel des données du compte (ZIP contenant `ratings.csv`) 🔶 format à confirmer |
| Écriture | **Fichier** : importeur CSV officiel <https://letterboxd.com/import/> ✅ |
| Échelle | 0,5 à 5, pas de 0,5 (`Rating`), ou entiers 1 à 10 (`Rating10`) ✅ |
| IDs externes | L'import accepte `imdbID` et `tmdbID` ✅ |
| CGU | Robots et scrapers interdits (§ 6.11) : **pas d'automatisation du site** |

## Écriture par fichier d'import ✅

Source : <https://letterboxd.com/about/importing-data/>

- CSV UTF-8, séparateur virgule sans espace après, colonnes dans n'importe quel ordre.
- Colonnes : `LetterboxdURI`, `tmdbID`, `imdbID`, `Title`, `Year`, `Directors`, `Rating`, `Rating10`, `WatchedDate`, `Rewatch`, `Tags`, `Review`. Au moins une des quatre premières est obligatoire.
- Échappement des guillemets **par antislash** : c'est différent du RFC 4180, attention.
- Taille maximale : 1 Mo par fichier. Au-delà, il faut découper en répétant l'en-tête.
- L'importeur affiche un récapitulatif des correspondances avant confirmation. Une fois confirmé, l'import ne s'annule pas.
- Le comportement face à une note déjà présente n'est pas documenté ❓ Il faudra prévenir l'utilisateur.

## Lecture par fichier d'export 🔶

- Réglages > Données > Export. Le ZIP contient `ratings.csv` avec les colonnes `Date,Name,Year,Letterboxd URI,Rating` ❓ à confirmer sur un vrai export.
- L'export ne contient pas d'ID IMDb ni TMDB. Pour les obtenir, il faudrait résoudre l'URI Letterboxd, ce qui demande d'accéder au site : écarté.

## Conditions d'utilisation

Source : <https://letterboxd.com/legal/terms-of-use/>

- § 6.11 : bots, spiders et scrapers interdits sauf autorisation explicite.
- § 6.8 : export de contenu interdit, sauf ses propres publications.
- Conséquence : la V1 utilise uniquement l'export et l'import officiels, sans appel réseau à letterboxd.com. Aucune `host_permission` n'est nécessaire.

## Implémentation (`src/adapters/letterboxd`)

- **Lecture** : l'utilisateur choisit le ZIP d'export, ouvert dans le navigateur avec `DecompressionStream`, ou `ratings.csv` seul. Les colonnes sont reconnues sans tenir compte de la casse ni de la ponctuation (`Name`, `Year`, `Letterboxd URI`, `Rating`, `Date`). L'URI `boxd.it` sert d'identifiant de ligne.
- **Écriture** : fichier `letterboxd-import.csv` avec les colonnes `imdbID` et `tmdbID` (seulement si au moins une ligne en a), `Title` (titre original de préférence), `Year`, `Directors` et `Rating` (0,5–5). Les guillemets sont échappés par une barre oblique inverse, comme le demande la doc, et le fichier est découpé sous 1 Mo.
- **Correspondance** : faite par l'importeur. Une ligne avec un ID IMDb ou TMDB est classée « sûr » ; sans ID, elle est classée « à vérifier » et décochée, et l'utilisateur doit la valider.
- **Tests** : sur fixtures **synthétiques** uniquement (`__fixtures__/ratings.synthetic.csv`).

## Vérifié sur le vrai site (compte de test, 2026-11-03)

- La page `letterboxd.com/import/` indique que **l'importeur est normalement réservé aux membres Pro**, ouvert à tous « pour une durée limitée ». Elle annonce aussi **1 900 titres maximum par fichier**, en UTF-8. L'adaptateur découpe désormais aussi à 1 900 lignes.
- Le fichier généré par l'adaptateur a été déposé : 6 films AlloCiné sans ID et 1 film IMDb avec ID. **Le rapprochement est correct pour les 7** ✅
  - Les cellules `imdbID` vides sont acceptées.
  - « À bout de souffle » est reconnu comme « Breathless », grâce à l'année et au réalisateur.
  - Les accents et la colonne `Directors` entre guillemets passent correctement.
- L'importeur prévient que « Titles will be marked as watched » : c'est indiqué dans `writeSideEffects`.
- **Letterboxd affiche une vérification anti-robot (« Security check ») à une session automatisée**, et pas à l'utilisateur. Je n'ai pas cherché à la contourner : la confirmation de l'import a été laissée à l'utilisateur. C'est cohérent avec le choix de ne jamais automatiser le site.

- Import confirmé par l'utilisateur : les 7 notes ont été enregistrées ✅
- **Un second import remplace la note existante sans aucun avertissement** ✅ : Men in Black II est passé de 3 à 4.
  - Parade : dans l'aperçu, l'utilisateur peut fournir son export Letterboxd actuel. Les notes déjà présentes sont alors retrouvées par titre et année (correspondances « sûres » uniquement), puis traitées comme des conflits, donc conservées par défaut.
  - Limite : un film dont le titre Letterboxd diffère trop du titre source (« Breathless » pour « À bout de souffle ») n'est pas reconnu.
- **Export réel** (ZIP) : `ratings.csv` contient exactement `Date,Name,Year,Letterboxd URI,Rating`. `Name` est le titre affiché par Letterboxd, souvent anglais. `Date` est la date d'import, pas celle du visionnage. Le ZIP contient aussi `watched.csv`, `diary.csv`, `profile.csv` (données personnelles, jamais lu), etc. Seul `ratings.csv` est conservé en fixture (`__fixtures__/ratings.real.csv`).

## Reste à vérifier

1. Un export plus gros (pagination éventuelle, notes sans film « vu »).
