# IMDb

> Exploration documentaire du 2026-11-03.
> Légende : ✅ vérifié · 🔶 source tierce · ❓ à vérifier.

## Résumé

| Sujet | État |
|---|---|
| API officielle | Aucune API grand public. L'offre de données d'IMDb est commerciale (sous licence) |
| Lecture | **Fichier** : export CSV officiel des notes (Your Ratings > ⋮ > Export) 🔶 |
| Écriture | **Aucune méthode officielle** : pas d'import de notes |
| Échelle | Entiers 1 à 10 |
| IDs | `tt…` : c'est l'identifiant externe de référence |
| CGU | Robots, data mining et screen scraping explicitement interdits ✅ |

## Lecture par fichier 🔶

- Colonnes connues : `Const` (ID `tt…`), `Your Rating`, `Date Rated` (AAAA-MM-JJ), `Title`, `Original Title` ❓, `Year`, `Runtime (mins)`, `Directors`, `Title Type`, `URL`.
- C'est la meilleure source possible : chaque ligne porte l'ID IMDb. Vers Letterboxd ou Trakt, la correspondance sera exacte.
- Il faut confirmer les en-têtes sur un vrai export anonymisé. Ils ont changé au fil des années, avec par exemple un export asynchrone sur la page « Exports » ❓

## Écriture

- Pas d'import officiel. RatS et les userscripts automatisent l'interface, ce que les CGU interdisent.
- **Décision proposée** : IMDb est une source uniquement, jamais une destination.

## Conditions d'utilisation ✅

Source : <https://www.imdb.com/conditions>

- Interdiction du data mining, des robots, du screen scraping et des outils équivalents sans accord écrit.
- Licence limitée à un usage personnel et non commercial.
- Conséquence : aucune `host_permission` sur imdb.com. L'adaptateur ne fait que lire un fichier choisi par l'utilisateur.
