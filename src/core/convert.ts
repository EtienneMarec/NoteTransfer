import { LocalizedError, msg, type Lang, type Msg } from './i18n';
import type { RatingScale } from './pivot';

export type RoundingMode = 'nearest' | 'down' | 'up';

export interface ConversionResult {
  value: number;
  /** Vrai si la valeur convertie représente exactement la note d'origine. */
  exact: boolean;
  /** Valeur avant alignement sur le pas de destination. */
  raw: number;
  /** Explication affichable quand la conversion est inexacte. */
  rule?: Msg;
}

const ROUNDING_RULES = { nearest: 'round.nearest', down: 'round.down', up: 'round.up' } as const satisfies Record<RoundingMode, Msg['key']>;

// Évite les erreurs flottantes (0.1 + 0.2) en travaillant au millionième.
const PRECISION = 1e6;
const fix = (n: number) => Math.round(n * PRECISION) / PRECISION;

export function isValidRating(value: number, scale: RatingScale): boolean {
  if (!Number.isFinite(value) || value < scale.min || value > scale.max) return false;
  const steps = fix((value - scale.min) / scale.step);
  return Number.isInteger(steps);
}

/**
 * Convertit une note proportionnellement au maximum de chaque échelle
 * (3,5/5 → 7/10), puis l'aligne sur le pas et les bornes de la destination.
 */
export function convertRating(
  value: number,
  from: RatingScale,
  to: RatingScale,
  rounding: RoundingMode = 'nearest',
): ConversionResult {
  if (!isValidRating(value, from)) {
    throw new LocalizedError(msg('err.outOfScale', { value, min: from.min, max: from.max, step: from.step }));
  }
  const raw = fix((value / from.max) * to.max);

  const steps = fix((raw - to.min) / to.step);
  const roundedSteps =
    rounding === 'down' ? Math.floor(steps) : rounding === 'up' ? Math.ceil(steps) : Math.floor(steps + 0.5);
  const snapped = fix(to.min + roundedSteps * to.step);
  const clamped = Math.min(to.max, Math.max(to.min, snapped));

  if (clamped === raw) return { value: clamped, exact: true, raw };

  const outOfBounds = raw < to.min || raw > to.max;
  const rule = outOfBounds ? msg('round.clamped', { min: to.min, max: to.max }) : msg(ROUNDING_RULES[rounding]);
  return { value: clamped, exact: false, raw, rule };
}

export function formatRating(value: number, scale: RatingScale, lang: Lang = 'fr'): string {
  return `${value.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US')}/${scale.max}`;
}
