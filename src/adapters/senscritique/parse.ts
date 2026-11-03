import type { Candidate } from '../../core/adapter';
import type { PivotEntry, PivotWork, PlatformRef } from '../../core/pivot';
import { SCALES } from '../../core/scales';

export const SC_ORIGIN = 'https://www.senscritique.com';
export const MOVIE_UNIVERSE = 1;

export interface ScSearchProduct {
  id: number;
  title: string;
  originalTitle: string | null;
  dateRelease: string | null;
  dateReleaseOriginal: string | null;
  universe: number;
  url: string;
}

export interface ScProduct {
  id: number;
  title: string;
  originalTitle: string | null;
  yearOfProduction: number | null;
  /** En secondes. */
  duration: number | null;
  universe?: number;
  url: string | null;
  directors: Array<{ name: string }> | null;
}

const yearOf = (date: string | null) => (date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : undefined);

export function refOf(id: number, url?: string | null): PlatformRef {
  return { platform: 'senscritique', id: String(id), url: url ? new URL(url, SC_ORIGIN).toString() : `${SC_ORIGIN}/film/-/${id}` };
}

function work(p: { id: number; title: string; originalTitle: string | null; url: string | null }, extra: Partial<PivotWork>): PivotWork {
  return {
    kind: 'movie',
    title: p.title,
    // SensCritique renvoie null quand le titre original est identique au titre affiché.
    originalTitle: p.originalTitle ?? p.title,
    externalIds: {},
    refs: [refOf(p.id, p.url)],
    ...extra,
  };
}

export function candidateFromSearch(p: ScSearchProduct): Candidate {
  const year = yearOf(p.dateReleaseOriginal) ?? yearOf(p.dateRelease);
  return { ref: refOf(p.id, p.url), work: work(p, year ? { year } : {}) };
}

export function candidateFromProduct(p: ScProduct): Candidate {
  const directors = (p.directors ?? []).map((d) => d.name).filter(Boolean);
  return {
    ref: refOf(p.id, p.url),
    work: work(p, {
      ...(p.yearOfProduction && { year: p.yearOfProduction }),
      ...(directors.length && { directors }),
      ...(p.duration && { runtimeMinutes: Math.round(p.duration / 60) }),
    }),
  };
}

export function entryFromCollection(
  p: ScProduct & { otherUserInfos: { rating: number | null; dateDone: string | null } | null },
  fetchedAt: string,
): PivotEntry {
  const entry: PivotEntry = { work: candidateFromProduct(p).work, source: { platform: 'senscritique', fetchedAt } };
  const rating = p.otherUserInfos?.rating;
  if (typeof rating === 'number' && rating > 0) {
    entry.rating = { value: rating, scale: SCALES.integersOf10 };
    if (p.otherUserInfos?.dateDone) entry.rating.ratedAt = p.otherUserInfos.dateDone;
  }
  return entry;
}

/** `https://www.senscritique.com/film/la_haine/472094` → id 472094. */
export function parseScUrl(url: string): PlatformRef | null {
  try {
    const u = new URL(url.trim());
    if (!/(^|\.)senscritique\.com$/.test(u.hostname)) return null;
    const m = /^\/film\/[^/]+\/(\d+)\/?/.exec(u.pathname);
    return m ? refOf(Number(m[1]), u.pathname) : null;
  } catch {
    return null;
  }
}
