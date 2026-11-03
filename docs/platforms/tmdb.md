# TMDB (The Movie Database)

> Exploration documentaire du 2026-11-03.
> Légende : ✅ vérifié dans la doc officielle · 🔶 source tierce · ❓ à vérifier.

## Deux rôles

1. **Plateforme** source ou destination de notes.
2. **Service de correspondance** optionnel : retrouver l'ID IMDb ou TMDB d'un film à partir de son titre et de son année, pour améliorer la correspondance entre deux plateformes qui n'ont pas d'ID externe (AlloCiné → SensCritique, par exemple).

Dans les deux cas, la clé API est **fournie par l'utilisateur** et stockée localement.

## Résumé

| Sujet | État |
|---|---|
| API officielle | Oui, v3 `https://api.themoviedb.org/3` ✅ |
| Écriture | `POST /3/movie/{movie_id}/rating`, corps `{"value": 8.5}` ✅ |
| Lecture | `GET /3/account/{account_id}/rated/movies` (paginé) 🔶 |
| Authentification | Clé API ou jeton Bearer, plus `session_id` utilisateur (flux `request_token` → approbation sur themoviedb.org → `session_id`) 🔶 |
| Échelle | 0,5 à 10 🔶. Pas de 0,5 ❓ |
| IDs | ID TMDB ; `external_ids` donne l'ID IMDb ; `/find/{imdb_id}?external_source=imdb_id` 🔶 |
| Effet de bord | Noter un film le retire de la watchlist par défaut ✅ (doc officielle) |

## Conditions d'utilisation de l'API ✅

Source : <https://www.themoviedb.org/api-terms-of-use>

- Logo TMDB et mention de non-affiliation obligatoires.
- **Cache limité à 6 mois** : les correspondances obtenues via TMDB doivent expirer.
- Usage non commercial uniquement avec une clé gratuite.
- Pas de limite chiffrée publiée. TMDB peut restreindre l'accès en cas d'abus.

## Reste à vérifier

1. Pas de note (0,5 ou 1 ?) et valeurs refusées.
2. Flux d'authentification utilisateur depuis une extension (redirection après approbation).
3. Limites de débit réelles (en-têtes de réponse).
