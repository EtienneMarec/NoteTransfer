import type { RatingScale } from './pivot';

/** Échelles documentées dans docs/platforms/*.md. */
export const SCALES = {
  halfStarsOf5: { min: 0.5, max: 5, step: 0.5 }, // AlloCiné, Letterboxd
  integersOf10: { min: 1, max: 10, step: 1 }, // SensCritique, IMDb
  // Aucune plateforme actuelle : sert à tester les conversions inexactes (demi-points sur 10).
  halfPointsOf10: { min: 0.5, max: 10, step: 0.5 },
} as const satisfies Record<string, RatingScale>;
