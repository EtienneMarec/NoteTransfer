/**
 * Format pivot commun. Les adaptateurs lisent vers ce format et écrivent depuis lui :
 * il n'y a jamais de conversion directe entre deux plateformes.
 */
export const PIVOT_SCHEMA_VERSION = 1;

export type PlatformId = 'allocine' | 'senscritique' | 'letterboxd' | 'imdb' | 'trakt' | 'tmdb';

/** V1 : 'movie' uniquement. Les autres valeurs réservent la place des séries. */
export type WorkKind = 'movie' | 'series' | 'season' | 'episode';

export interface RatingScale {
  min: number;
  max: number;
  step: number;
}

export interface PivotRating {
  /** Valeur d'origine, jamais modifiée. */
  value: number;
  /** Échelle d'origine. */
  scale: RatingScale;
  /** ISO 8601, si la plateforme la fournit. */
  ratedAt?: string;
}

export interface ExternalIds {
  imdb?: string;
  tmdb?: number;
  trakt?: number;
  eidr?: string;
}

export interface PlatformRef {
  platform: PlatformId;
  /** Identifiant natif de la plateforme (ex. '12551' pour AlloCiné). */
  id: string;
  url?: string;
}

export interface PivotWork {
  kind: WorkKind;
  /** Titre affiché par la plateforme (souvent le titre français). */
  title: string;
  originalTitle?: string;
  year?: number;
  directors?: string[];
  runtimeMinutes?: number;
  externalIds: ExternalIds;
  refs: PlatformRef[];
  /** Futur : saison → série, épisode → saison. */
  parent?: PlatformRef;
}

export interface PivotEntry {
  work: PivotWork;
  rating?: PivotRating;
  // Champs prévus pour les versions suivantes, ignorés en V1.
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

export function refFor(work: PivotWork, platform: PlatformId): PlatformRef | undefined {
  return work.refs.find((r) => r.platform === platform);
}
