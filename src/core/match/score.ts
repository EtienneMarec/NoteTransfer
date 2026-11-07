import { msg, type Msg } from '../i18n';
import type { Candidate, WorkQuery } from '../adapter';
import type { ExternalIds, PivotWork } from '../pivot';
import { normalizeName, titleSimilarity } from './normalize';

export type Confidence = 'sure' | 'review' | 'not_found';

export interface SignalDetail {
  title: number;
  year?: number;
  director?: number;
  runtime?: number;
  externalId?: 'match' | 'conflict';
}

export interface ScoredCandidate {
  candidate: Candidate;
  score: number;
  signals: SignalDetail;
}

export interface MatchDecision {
  confidence: Confidence;
  best?: ScoredCandidate;
  /** Tous les candidats retenus, du meilleur au moins bon (pour la correction manuelle). */
  ranked: ScoredCandidate[];
  reason: Msg;
}

export const WEIGHTS = { title: 0.45, year: 0.25, director: 0.2, runtime: 0.1 } as const;
export const THRESHOLDS = { sure: 0.85, review: 0.5, ambiguityGap: 0.1, maxYearGap: 2 } as const;

const ID_KEYS: (keyof ExternalIds)[] = ['imdb', 'tmdb', 'eidr'];

function compareIds(a: ExternalIds, b: ExternalIds): 'match' | 'conflict' | undefined {
  let result: 'match' | undefined;
  for (const key of ID_KEYS) {
    if (a[key] === undefined || b[key] === undefined) continue;
    if (a[key] !== b[key]) return 'conflict';
    result = 'match';
  }
  return result;
}

function bestTitle(q: WorkQuery, w: PivotWork): number {
  const left = [q.title, q.originalTitle].filter((t): t is string => !!t);
  const right = [w.title, w.originalTitle].filter((t): t is string => !!t);
  let best = 0;
  for (const l of left) for (const r of right) best = Math.max(best, titleSimilarity(l, r));
  return best;
}

function yearSignal(a?: number, b?: number): number | undefined | null {
  if (a === undefined || b === undefined) return undefined;
  const gap = Math.abs(a - b);
  if (gap > THRESHOLDS.maxYearGap) return null; // élimine le candidat
  // ±1 an est fréquent (sortie française ≠ sortie originale) mais ne suffit pas seul pour « sûr ».
  return gap === 0 ? 1 : gap === 1 ? 0.5 : 0.2;
}

function directorSignal(a?: string[], b?: string[]): number | undefined {
  if (!a?.length || !b?.length) return undefined;
  const set = new Set(a.map(normalizeName));
  return b.some((d) => set.has(normalizeName(d))) ? 1 : 0;
}

function runtimeSignal(a?: number, b?: number): number | undefined {
  if (!a || !b) return undefined;
  const gap = Math.abs(a - b);
  return gap <= 5 ? 1 : gap <= 10 ? 0.5 : 0;
}

/**
 * Score de 0 à 1. Seuls les signaux connus des deux côtés comptent, et le score est
 * renormalisé sur leurs poids. Sans année, le score est plafonné sous le seuil « sûr ».
 * Renvoie null si le candidat est incompatible (ID externe différent, années trop éloignées).
 */
export function scoreCandidate(q: WorkQuery, c: Candidate): ScoredCandidate | null {
  const w = c.work;
  const ids = compareIds(q.externalIds, w.externalIds);
  if (ids === 'conflict') return null;

  const title = bestTitle(q, w);
  if (ids === 'match') return { candidate: c, score: 1, signals: { title, externalId: 'match' } };

  const year = yearSignal(q.year, w.year);
  if (year === null) return null;
  const director = directorSignal(q.directors, w.directors);
  const runtime = runtimeSignal(q.runtimeMinutes, w.runtimeMinutes);

  let sum = WEIGHTS.title * title;
  let weights = WEIGHTS.title;
  for (const [signal, weight] of [
    [year, WEIGHTS.year],
    [director, WEIGHTS.director],
    [runtime, WEIGHTS.runtime],
  ] as const) {
    if (signal === undefined) continue;
    sum += weight * signal;
    weights += weight;
  }
  let score = sum / weights;
  if (year === undefined) score = Math.min(score, THRESHOLDS.sure - 0.01);
  // Un titre très différent ne peut pas être rattrapé par l'année et la durée seules.
  if (title < 0.5) score = Math.min(score, title);

  const signals: SignalDetail = { title };
  if (year !== undefined) signals.year = year;
  if (director !== undefined) signals.director = director;
  if (runtime !== undefined) signals.runtime = runtime;
  return { candidate: c, score: Math.round(score * 1000) / 1000, signals };
}

export function decideMatch(q: WorkQuery, candidates: Candidate[]): MatchDecision {
  const ranked = candidates
    .map((c) => scoreCandidate(q, c))
    .filter((s): s is ScoredCandidate => s !== null)
    .sort((a, b) => b.score - a.score);

  const [best, second] = ranked;
  if (!best || best.score < THRESHOLDS.review) {
    return { confidence: 'not_found', ranked, reason: msg(ranked.length ? 'match.noCloseCandidate' : 'match.noCandidate') };
  }
  if (best.signals.externalId === 'match') {
    return { confidence: 'sure', best, ranked, reason: msg('match.externalId') };
  }
  if (second && best.score - second.score < THRESHOLDS.ambiguityGap) {
    return { confidence: 'review', best, ranked, reason: msg('match.multipleClose') };
  }
  if (best.score >= THRESHOLDS.sure) {
    return { confidence: 'sure', best, ranked, reason: msg('match.sure') };
  }
  return { confidence: 'review', best, ranked, reason: msg('match.partial') };
}
