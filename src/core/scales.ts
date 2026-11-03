import type { RatingScale } from './pivot';

/** Échelles documentées dans docs/platforms/*.md. */
export const SCALES = {
  halfStarsOf5: { min: 0.5, max: 5, step: 0.5 }, // AlloCiné, Letterboxd
  integersOf10: { min: 1, max: 10, step: 1 }, // SensCritique, IMDb, Trakt
  halfPointsOf10: { min: 0.5, max: 10, step: 0.5 }, // TMDB (pas à confirmer)
} as const satisfies Record<string, RatingScale>;
