# Plan : extension de transfert de notes de films

> Ce plan est à valider **avant de coder**. Les faits sur chaque plateforme sont dans `docs/platforms/*.md`.

## 1. Points bloquants et restrictions (à trancher)

| # | Plateforme | Point | Proposition |
|---|---|---|---|
| B1 | AlloCiné | CGU art. 7.5 et 8.1 : toute extraction automatisée est interdite, même minime. Risque : suspension du compte (art. 9) | Deux modes au choix. **(a)** Lecture via l'API interne, lente, avec avertissement explicite et accord de l'utilisateur. **(b)** Import de l'export RGPD obtenu auprès du DPO de Webedia (format inconnu). Recommandation : prévoir (a) pour la V1, avec un avertissement bloquant à accepter, et ajouter (b) dès qu'un export réel est disponible |
| B2 | AlloCiné, SensCritique | Les deux API GraphQL sont internes et non documentées. Elles peuvent changer sans préavis | Requêtes minimales, version de schéma testée, détection d'erreur `GRAPHQL_VALIDATION_FAILED` qui met le transfert en pause avec le message « l'adaptateur doit être mis à jour » |
| B3 | AlloCiné → SensCritique | Aucun des deux sites n'expose d'ID IMDb ou TMDB | Correspondance par titre FR, titre original, année, réalisateur et durée. Une clé TMDB optionnelle n'aide que marginalement ici (voir § 5) |
| B4 | IMDb | CGU : robots et scraping interdits, pas d'import officiel | IMDb en source **par fichier uniquement**, jamais en destination |
| B5 | Letterboxd | CGU § 6.11 : bots interdits | Lecture et écriture **par fichiers officiels uniquement**, sans aucune requête vers le site |
| B6 | Trakt | Un `client_secret` ne peut pas rester secret dans une extension open source | PKCE si possible, sinon application Trakt créée par l'utilisateur |
| B7 | SensCritique | Cloudflare protège le site | Requêtes exécutées depuis un onglet du site. En cas de challenge : pause et message, sans aucun contournement |

## 2. Choix techniques

- **WXT** (Vite) : un seul code TypeScript, des manifestes MV3 générés pour Chrome (`service_worker`) et Firefox (`background.scripts`), rechargement à chaud.
- **Preact** pour l'interface : une page d'extension plein onglet, plus légère que React.
- **Vitest** pour les tests, **IndexedDB** (via `idb`) pour l'état des jobs et le cache, `storage.local` pour les réglages.
- Aucune dépendance réseau tierce : pas d'analytics, pas de serveur.

### Où s'exécutent les requêtes

```
 Page d'app (UI)  ──messages──►  Background (orchestrateur, état persistant)
                                     │
                     ┌───────────────┼────────────────┐
                     ▼               ▼                ▼
          Pont de site (script   Client HTTP API   Lecteur/générateur
          de contenu dans un     officielle        de fichiers
          onglet AlloCiné/SC)    (Trakt, TMDB)     (IMDb, Letterboxd)
```

- **Pont de site** : pour AlloCiné et SensCritique, le background envoie une requête GraphQL au script de contenu d'un onglet du site, qui l'exécute avec `fetch` dans le contexte de la page. Avantages : l'extension ne lit, ne stocke et ne journalise jamais un cookie ou un jeton ; Cloudflare voit une requête normale du site ; le comportement est le même sur Chrome et Firefox, où la gestion des cookies tiers est différente.
- Si aucun onglet n'est ouvert, l'extension en ouvre un en arrière-plan sur la page d'accueil du site, puis le ferme à la fin.

### Persistance et suspension du service worker

- Chaque transfert est un **job** stocké dans IndexedDB. Il contient la liste des lignes, et chaque ligne a un statut : `pending → in_flight → done | skipped | failed`.
- Avant chaque écriture, la ligne passe en `in_flight` et l'état est enregistré. Après la réponse, elle passe en `done` ou `failed`.
- **Reprise** : une ligne trouvée en `in_flight` au redémarrage n'est **pas** renvoyée à l'aveugle. L'extension relit d'abord la note de destination avec `getExistingRating()` : si la note attendue est là, la ligne passe en `done`, sinon elle est réessayée. Le transfert est ainsi idempotent et sans doublon.
- `chrome.alarms` relance l'orchestrateur après une suspension. Le job avance par petites unités, une écriture à la fois, et aucune promesse longue ne reste en mémoire.

## 3. Modèle de données pivot

```ts
// src/core/pivot.ts
export const PIVOT_SCHEMA_VERSION = 1;

export type PlatformId = 'allocine' | 'senscritique' | 'letterboxd' | 'imdb' | 'trakt' | 'tmdb';
export type WorkKind = 'movie' | 'series' | 'season' | 'episode'; // V1 : 'movie' uniquement

export interface RatingScale {
  min: number;   // ex. 0.5
  max: number;   // ex. 5
  step: number;  // ex. 0.5
}

export interface PivotRating {
  value: number;          // valeur d'origine, jamais modifiée
  scale: RatingScale;     // échelle d'origine
  ratedAt?: string;       // ISO 8601 si connue
}

export interface ExternalIds {
  imdb?: string;          // 'tt0113247'
  tmdb?: number;
  trakt?: number;
  eidr?: string;
}

export interface PlatformRef {
  platform: PlatformId;
  id: string;             // ID natif ('12551', '472094'…)
  url?: string;
}

export interface PivotWork {
  kind: WorkKind;
  title: string;            // titre affiché sur la plateforme
  originalTitle?: string;
  year?: number;
  directors?: string[];
  runtimeMinutes?: number;
  externalIds: ExternalIds;
  refs: PlatformRef[];      // une entrée par plateforme connue
  parent?: PlatformRef;     // futur : saison → série, épisode → saison
}

export interface PivotEntry {
  work: PivotWork;
  rating?: PivotRating;
  // Champs prévus pour plus tard, ignorés en V1 :
  watchedDates?: string[];
  review?: { text: string; format: 'text' | 'html'; spoiler?: boolean };
  inWatchlist?: boolean;
  source: { platform: PlatformId; fetchedAt: string };
}

export interface PivotExport {
  schemaVersion: typeof PIVOT_SCHEMA_VERSION;
  exportedAt: string;
  entries: PivotEntry[];
}
```

## 4. Interface des adaptateurs

```ts
// src/core/adapter.ts
export type ReadMethod = 'api' | 'site' | 'file';
export type WriteMethod = 'api' | 'site' | 'file';

export interface Capabilities {
  read: ReadMethod | null;
  write: WriteMethod | null;
  scale: RatingScale;
  kinds: WorkKind[];                  // V1 : ['movie']
  providesExternalIds: (keyof ExternalIds)[];   // ce que readRatings fournit
  lookupByExternalId: (keyof ExternalIds)[];    // ce que searchFilm accepte
  requiresUserCredentials?: 'apiKey' | 'oauth'; // TMDB, Trakt
  writeBatchSize?: number;            // Trakt accepte des lots ; 1 sinon
  notes?: string;                     // affiché dans l'UI (ex. « fichier d'import officiel »)
}

export type SessionStatus =
  | { state: 'ok'; displayName?: string }
  | { state: 'signed_out'; loginUrl: string }
  | { state: 'blocked'; reason: 'captcha' | 'challenge' | 'forbidden'; url?: string }
  | { state: 'needs_setup'; what: 'apiKey' | 'oauth' | 'file' };

export interface Page<T> { items: T[]; nextCursor: string | null; total?: number }

export interface WorkQuery {
  title: string;
  originalTitle?: string;
  year?: number;
  directors?: string[];
  runtimeMinutes?: number;
  externalIds: ExternalIds;
}

export interface Candidate {
  ref: PlatformRef;
  work: PivotWork;          // infos du candidat, pour le score et l'affichage
}

export type WriteResult =
  | { ok: true; verified: boolean }
  | { ok: false; retryable: boolean; reason: string };

/** Contexte fourni par le noyau : l'adaptateur ne fait jamais de fetch lui-même. */
export interface AdapterContext {
  http: RateLimitedHttp;      // file par hôte, délai aléatoire, backoff 429, détection de blocage
  site?: SiteBridge;          // exécute une requête depuis un onglet du site
  settings: AdapterSettings;  // clé API, etc., lus dans le stockage local
  signal: AbortSignal;        // pause et annulation
  log: Logger;                // filtre automatiquement les en-têtes sensibles
}

export interface PlatformAdapter {
  id: PlatformId;
  displayName: string;
  capabilities: Capabilities;
  /** Origines à demander via permissions.request() quand l'utilisateur choisit la plateforme. */
  hostPermissions: string[];

  checkSession(ctx: AdapterContext): Promise<SessionStatus>;

  // Lecture (read: 'api' | 'site')
  readRatings?(ctx: AdapterContext, cursor: string | null): Promise<Page<PivotEntry>>;
  // Lecture (read: 'file')
  parseExport?(file: File): Promise<PivotEntry[]>;

  // Destination
  searchFilm?(ctx: AdapterContext, q: WorkQuery): Promise<Candidate[]>;
  getExistingRating?(ctx: AdapterContext, ref: PlatformRef): Promise<PivotRating | null>;
  writeRating?(ctx: AdapterContext, ref: PlatformRef, value: number): Promise<WriteResult>;
  // Destination (write: 'file')
  buildImportFiles?(rows: Array<{ work: PivotWork; value: number }>): Promise<Array<{ name: string; blob: Blob }>>;
  importInstructions?: string;   // marche à suivre affichée à l'utilisateur
}
```

**Remarques**

- `readRatings` est paginé par curseur pour pouvoir reprendre après une suspension.
- `writeRating` reçoit une valeur déjà convertie dans l'échelle de destination. La conversion se fait dans le noyau et y est testée.
- L'UI construit la liste des transferts possibles à partir des capacités : source si `read !== null`, destination si `write !== null`. Si `write === 'file'`, l'étape d'écriture devient « Générer le fichier et suivre les instructions ».
- `registry.ts` liste les adaptateurs. Ajouter une plateforme revient à écrire un adaptateur, l'enregistrer et déclarer son origine dans `optional_host_permissions`.

### Capacités prévues

| Plateforme | read | write | Échelle | IDs fournis |
|---|---|---|---|---|
| AlloCiné | `site` | `site` | 0,5–5 / 0,5 | — |
| SensCritique | `site` | `site` | 1–10 / 1 | — |
| Letterboxd | `file` | `file` | 0,5–5 / 0,5 | — (import : imdb, tmdb) |
| IMDb | `file` | — | 1–10 / 1 | imdb |
| Trakt | `api` | `api` | 1–10 / 1 | imdb, tmdb, trakt |
| TMDB | `api` | `api` | 0,5–10 / 0,5 ❓ | tmdb, imdb |

## 5. Correspondance des films

1. **ID externe commun** (IMDb ou TMDB) des deux côtés : confiance 1,0, classé « sûr ».
2. **Cache local** des correspondances déjà validées ou corrigées par l'utilisateur, avec la clé `source:id → dest:id` : classé « sûr ».
3. **Recherche** sur la destination avec le titre FR, puis le titre original si besoin. Chaque candidat reçoit un score de 0 à 1 :
   - Titre : similarité après normalisation (minuscules, sans accents ni ponctuation, articles déplacés, « & » → « et »). La valeur retenue est le meilleur score parmi les combinaisons titre ↔ titre, titre ↔ titre original, etc. Poids 0,45.
   - Année : 0,25 si identique, 0,15 à ±1 an (les dates de sortie FR et internationales diffèrent), 0 sinon. **Un écart de plus de 2 ans élimine le candidat.**
   - Réalisateur : 0,2 si un nom normalisé est commun.
   - Durée : 0,1 si l'écart est de 5 min au plus. Vu sur La Haine : 95 min sur AlloCiné contre 98 sur SensCritique, donc la tolérance doit être large.
   - Pénalité si deux candidats ont des scores proches (écart inférieur à 0,1) : classé « à vérifier ».
4. **Classement** : « sûr » si le score est d'au moins 0,85 et sans ambiguïté ; « à vérifier » entre 0,5 et 0,85 ; « introuvable » en dessous de 0,5 ou sans candidat.
5. **TMDB optionnel** : il sert surtout quand la destination accepte les ID (Trakt, Letterboxd, TMDB). Pour AlloCiné → SensCritique, il peut confirmer le titre original et l'année quand AlloCiné ne les fournit pas. Les entrées issues de TMDB expirent après 6 mois, comme l'exigent ses CGU.

Ces seuils sont un point de départ. Ils seront calibrés sur un jeu de fixtures de titres pièges : remakes, homonymes, titres traduits.

## 6. Conversion des notes

Fonction pure `convert(value, from, to, rounding) → { value, exact, rule }` :

1. Conversion proportionnelle : `v' = value / from.max × to.max`, donc 3,5/5 → 7/10 et 7/10 → 3,5/5.
2. Alignement sur le pas de destination : `round(v' / step) × step`, selon la règle choisie. Par défaut, « au plus proche, demi vers le haut » ; options « vers le bas » et « vers le haut ».
3. Bornage à `[to.min, to.max]` : une note de 0,5/10 sur TMDB devient 1/10 sur SensCritique, et c'est signalé comme inexact.
4. `exact = (v' === résultat)`. Si la conversion est inexacte, l'aperçu affiche « 7,5/10 → 8/10 (arrondi au plus proche) ».

Entre les échelles 0,5–5 (AlloCiné, Letterboxd) et 1–10 entières (SensCritique, IMDb, Trakt), la conversion est toujours **exacte** (×2 ou ÷2). Les seuls cas inexacts viennent de TMDB comme source, avec ses demi-points sur 10 : 7,5/10 → 8/10 sur SensCritique, ou 3,75 → 4/5 sur AlloCiné. Les tests couvrent quand même toutes les paires d'échelles.

## 7. Déroulement d'un transfert

| Étape | Détail |
|---|---|
| 1. Sessions | `checkSession()` source et destination. Si un site n'est pas connecté : lien vers sa page de connexion. L'extension ne demande jamais de mot de passe |
| 2. Lecture | `readRatings` paginé, ou import d'un fichier. Progression affichée, reprise possible |
| 3. Correspondances | `searchFilm` + score, puis `getExistingRating` pour chaque film trouvé |
| 4. Aperçu | Tableau : film, note source, note convertie (règle si inexacte), note existante, confiance, action prévue (`créer`, `ignorer : identique`, `conflit`, `à vérifier`, `introuvable`) |
| 5. Corrections | Choisir un autre candidat, coller une URL de destination, cocher ou décocher des lignes. Les lignes « à vérifier » sont décochées par défaut |
| 6. Conflits | Par défaut, **conserver la note existante**. Option par ligne ou globale : écraser |
| 7. Sauvegarde | Téléchargement JSON et CSV de la source, et des notes de destination qui seraient écrasées. Obligatoire avant d'écrire |
| 8. Lot de test | 3 lignes par défaut (réglable). Rapport intermédiaire, puis « Continuer » |
| 9. Rapport | Réussites, ignorés, échecs, avec les raisons. Export JSON et CSV |

**Mode simulation** : il déroule les étapes 1 à 9 sans appeler `writeRating`. Le rapport indique « simulé ».

## 8. Robustesse

- File d'attente **par hôte**, sans parallélisme vers un même site. Délai aléatoire réglable : 2 à 4 s par défaut pour AlloCiné et SensCritique, 1,1 s pour Trakt.
- Backoff sur les erreurs 429 et 5xx et sur les erreurs réseau : `Retry-After` s'il est fourni, sinon 4 s, 8 s, 16 s, 32 s, 64 s avec jitter. Après 5 échecs consécutifs, le job passe en **pause** avec la raison affichée.
- **Détection de blocage** : réponse HTML au lieu de JSON, en-tête `cf-mitigated`, statut 403 avec page de challenge, ou présence de `challenge-platform`. Le job passe en pause avec le message « Ouvrez <site>, résolvez la vérification, puis cliquez sur Reprendre ». Aucun contournement.
- **Vérification** après chaque écriture, quand c'est possible : relire `getExistingRating()`. Si la note relue diffère, la ligne est marquée `failed: non confirmé`.
- Schéma GraphQL changé (`GRAPHQL_VALIDATION_FAILED`) : arrêt immédiat avec le message « adaptateur obsolète ».

## 9. Sécurité et vie privée

- Aucun mot de passe demandé ni stocké. Aucun cookie ni jeton lu par l'extension : le pont de site s'en charge implicitement.
- Le logger retire `authorization`, `cookie` et `set-cookie`, ainsi que tout champ dont le nom contient `token`, `secret` ou `session`. Un test unitaire le vérifie.
- `permissions` : `storage`, `alarms`, `scripting`. `optional_host_permissions` par plateforme : `https://www.allocine.fr/*`, `https://mon.allocine.fr/*`, `https://graph.allocine.fr/*`, `https://www.senscritique.com/*`, `https://apollo.senscritique.com/*`, `https://api.trakt.tv/*`, `https://api.themoviedb.org/*`. Aucune permission pour IMDb ni Letterboxd.
- Clés API (TMDB, Trakt) dans `storage.local`, jamais exportées dans les sauvegardes.
- Bouton « Tout supprimer » : vide IndexedDB et `storage.local`, puis révoque les permissions optionnelles.
- Mentions TMDB et Trakt dans « À propos ».

## 10. Arborescence prévue

```
src/
  core/        pivot.ts, adapter.ts, registry.ts, convert.ts, match/ (normalize, score),
               job/ (state machine, store IndexedDB, runner), http/ (rate limiter, backoff, block detection),
               export/ (json, csv), log.ts
  adapters/    allocine/, senscritique/, letterboxd/, imdb/, trakt/, tmdb/
               (chacun : index.ts, queries.ts, parse.ts, __fixtures__/, *.test.ts)
  entrypoints/ background.ts, app/ (UI Preact), allocine.content.ts, senscritique.content.ts
docs/          plan.md, adding-a-platform.md, platforms/*.md
```

## 11. Étapes et tests

| Étape | Contenu | Tests |
|---|---|---|
| M0 | Squelette WXT, lint, Vitest, modèle pivot | build Chrome et Firefox |
| M1 | Noyau pur : conversion, normalisation, score, machine d'état du job, rate limiter, backoff, détection de blocage, logger | unitaires (dont reprise après interruption simulée) |
| M2 | Adaptateur SensCritique : session, recherche, note existante, écriture | fixtures anonymisées de réponses `apollo` |
| M3 | Adaptateur AlloCiné : session, lecture paginée | fixtures anonymisées |
| M4 | UI de l'assistant + mode simulation + sauvegarde + rapport | parcours complet en simulation sur fixtures |
| M5 | **Validation sur les vrais sites avec toi** : lecture, puis simulation, puis lot de 3 films après ton accord explicite | journal de vérification dans `docs/verification.md` |
| M6 | Letterboxd et IMDb (fichiers) | fixtures CSV |
| M7 | Trakt et TMDB (API officielles) | fixtures + validation réelle |
| M8 | README, `docs/adding-a-platform.md` | — |

Chaque fonctionnalité sera marquée « vérifiée sur le vrai site » ou « testée sur fixtures uniquement » dans `docs/verification.md`.
