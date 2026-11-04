import type { Candidate } from '../../core/adapter';
import type { PivotWork, PlatformRef } from '../../core/pivot';

export interface ImdbTitle {
  id: string;
  titleText?: { text: string } | null;
  originalTitleText?: { text: string } | null;
  releaseYear?: { year: number } | null;
  runtime?: { seconds: number } | null;
  directors?: { edges: Array<{ node: { name: { nameText: { text: string } | null } | null } }> } | null;
}

export const titleUrl = (id: string) => `https://www.imdb.com/title/${id}/`;
export const refOf = (id: string): PlatformRef => ({ platform: 'imdb', id, url: titleUrl(id) });

export function candidateOf(t: ImdbTitle): Candidate | null {
  const title = t.titleText?.text;
  if (!/^tt\d+$/.test(t.id) || !title) return null;
  const directors = (t.directors?.edges ?? []).map((e) => e.node.name?.nameText?.text).filter((d): d is string => !!d);
  const work: PivotWork = {
    kind: 'movie',
    title,
    ...(t.originalTitleText?.text && { originalTitle: t.originalTitleText.text }),
    ...(t.releaseYear?.year && { year: t.releaseYear.year }),
    ...(directors.length && { directors }),
    ...(t.runtime?.seconds && { runtimeMinutes: Math.round(t.runtime.seconds / 60) }),
    externalIds: { imdb: t.id },
    refs: [refOf(t.id)],
  };
  return { ref: work.refs[0]!, work };
}

export function parseSearch(data: { mainSearch: { edges: Array<{ node: { entity: ImdbTitle | null } | null }> } | null }): Candidate[] {
  return (data.mainSearch?.edges ?? [])
    .map((e) => e.node?.entity && candidateOf(e.node.entity))
    .filter((c): c is Candidate => !!c);
}

/** `https://www.imdb.com/fr/title/tt0113247/?ref_=…` → tt0113247. */
export function parseImdbUrl(url: string): PlatformRef | null {
  try {
    const u = new URL(url.trim());
    if (!/(^|\.)imdb\.com$/.test(u.hostname)) return null;
    const m = /\/title\/(tt\d+)/.exec(u.pathname);
    return m ? refOf(m[1]!) : null;
  } catch {
    return null;
  }
}

/** Lien du mode « à la main » : fiche exacte si l'ID est connu, sinon recherche de films. */
export function manualLink(work: PivotWork): { url: string; exact: boolean } {
  if (work.externalIds.imdb) return { url: titleUrl(work.externalIds.imdb), exact: true };
  const q = [work.originalTitle ?? work.title, work.year].filter(Boolean).join(' ');
  return { url: `https://www.imdb.com/find/?q=${encodeURIComponent(q)}&s=tt&ttype=ft`, exact: false };
}
