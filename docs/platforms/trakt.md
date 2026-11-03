# Trakt

> Exploration documentaire du 2026-11-03.
> Légende : ✅ vérifié dans la doc officielle · 🔶 source tierce · ❓ à vérifier.

## Résumé

| Sujet | État |
|---|---|
| API officielle | Oui, `https://api.trakt.tv` (doc : <https://developer.trakt.tv>) ✅ |
| Lecture | `GET /sync/ratings/movies` (🔶 à reconfirmer dans la doc) |
| Écriture | `POST /sync/ratings` avec un lot de films identifiés par `ids` (`imdb`, `tmdb`, `trakt`, `slug`) 🔶 |
| Recherche | `GET /search/imdb/<tt…>`, `GET /search/tmdb/<id>?type=movie` et recherche texte 🔶 |
| Authentification | OAuth 2 (code d'autorisation, device code, PKCE mentionné) ❓ |
| Échelle | Entiers 1 à 10 |
| CGU | **Usage autorisé** pour migrer ses propres données à sa demande ✅ |

## Limites ✅

Source : <https://developer.trakt.tv/docs/rate-limiting>

- GET authentifié : 500 appels / 5 min.
- POST, PUT et DELETE : **1 par seconde**.
- 429 avec `Retry-After`, à respecter. Sinon, backoff exponentiel avec jitter. L'en-tête `X-Ratelimit` est disponible pour le débogage.

## Politique d'usage ✅

Source : <https://developer.trakt.tv/docs/api-use-policy>

- Import, export et migration de ses propres notes autorisés à la demande de l'utilisateur.
- Mention obligatoire dans « À propos » : « Movie Rating Transfer uses Trakt but is not endorsed or certified by Trakt ».
- Interdit : manipulation automatisée des notes, contournement des limites, partage des identifiants de l'application.
- Une application API inutilisée 30 jours est supprimée automatiquement.
- Comptes gratuits : 2 « Community Apps » connectables.

## Point bloquant à trancher

Une application OAuth Trakt demande un `client_id`, et généralement un `client_secret` pour échanger le code contre un jeton. Dans une extension open source, ce secret serait public. Deux options :

1. **PKCE**, si Trakt l'accepte sans secret pour les clients publics. La doc le mentionne ❓
2. Chaque utilisateur crée sa propre application Trakt et colle son `client_id` et son `client_secret`, stockés localement. C'est plus lourd, mais sans risque pour le projet.

## Reste à vérifier

1. PKCE sans secret.
2. Format exact de `POST /sync/ratings` et de sa réponse (`added`, `not_found`).
3. Redirect URI compatible avec `identity.launchWebAuthFlow` (Chrome et Firefox).
