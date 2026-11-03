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

## Reste à vérifier

1. Colonnes exactes de `ratings.csv`, à partir d'un export anonymisé.
2. Effet d'un import sur un film déjà noté.
