import { convertRating, type ConversionResult, type RoundingMode } from '../convert';
import type { RatingScale } from '../pivot';
import type { ConflictPolicy, JobRow, PlannedAction } from './types';

export interface PlanInput {
  row: Pick<JobRow, 'entry' | 'match' | 'existing'>;
  destinationScale: RatingScale;
  rounding: RoundingMode;
  conflictPolicy: ConflictPolicy;
}

export interface RowPlan {
  action: PlannedAction;
  selected: boolean;
  conversion?: ConversionResult;
}

/**
 * Action prévue pour une ligne. Règles :
 * - rien d'incertain n'est sélectionné sans validation manuelle ;
 * - une note existante n'est jamais écrasée, sauf choix explicite.
 */
export function planRow({ row, destinationScale, rounding, conflictPolicy }: PlanInput): RowPlan {
  const rating = row.entry.rating;
  if (!rating) return { action: 'skip_unrated', selected: false };

  const conversion = convertRating(rating.value, rating.scale, destinationScale, rounding);
  const match = row.match;
  if (!match?.ref || match.confidence === 'not_found') return { action: 'skip_unmatched', selected: false, conversion };
  if (match.confidence === 'review' && !match.confirmedByUser) {
    return { action: 'skip_review', selected: false, conversion };
  }

  const existing = row.existing;
  if (existing == null) return { action: 'create', selected: true, conversion };
  if (existing.value === conversion.value) return { action: 'skip_identical', selected: false, conversion };
  return conflictPolicy === 'overwrite'
    ? { action: 'overwrite', selected: true, conversion }
    : { action: 'skip_conflict', selected: false, conversion };
}

export function isWriteAction(action: PlannedAction | undefined): boolean {
  return action === 'create' || action === 'overwrite';
}
