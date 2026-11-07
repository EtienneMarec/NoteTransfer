import { LocalizedError, msg } from '../../core/i18n';
import type { Candidate, Page } from '../../core/adapter';
import { isoDurationToMinutes } from '../../core/graphql';
import type { PivotEntry, PivotWork, PlatformRef } from '../../core/pivot';
import { SCALES } from '../../core/scales';

/** Champs d'un film, communs à la liste des notes, à la recherche et à la fiche. */
export interface AcMovie {
  __typename: string;
  internalId?: number;
  title?: string;
  originalTitle?: string | null;
  data?: { productionYear?: number | null } | null;
  runtime?: string | null;
  credits?: { edges: Array<{ node: { person: { firstName?: string | null; lastName?: string | null } | null } }> } | null;
}

export interface MoviesRatedResponse {
  me: {
    user: {
      social: {
        relatedEntities: {
          moviesSeen: {
            totalCount: number;
            pageInfo: { endCursor: string | null; hasNextPage: boolean };
            edges: Array<{
              node: {
                entity: AcMovie | null;
                opinion: { content: { rating: number | null } | null } | null;
              };
            }>;
          };
        };
      };
    } | null;
  } | null;
}

export interface SearchResponse {
  search: { edges: Array<{ node: { node: AcMovie | null } | null }> } | null;
}

export const filmUrl = (id: number | string) => `https://www.allocine.fr/film/fichefilm_gen_cfilm=${id}.html`;

/** Identifiant GraphQL (style Relay) d'un film : base64("Movie:<id>"). */
export const entityIdOf = (internalId: number | string) => btoa(`Movie:${internalId}`);

export const refOf = (internalId: number | string): PlatformRef => ({
  platform: 'allocine',
  id: String(internalId),
  url: filmUrl(internalId),
});

export function workOf(e: AcMovie): PivotWork | null {
  if (e.__typename !== 'Movie' || e.internalId === undefined || !e.title) return null;
  const directors = (e.credits?.edges ?? [])
    .map(({ node: n }) => [n.person?.firstName, n.person?.lastName].filter(Boolean).join(' '))
    .filter(Boolean);
  const runtime = isoDurationToMinutes(e.runtime);
  return {
    kind: 'movie',
    title: e.title,
    ...(e.originalTitle && { originalTitle: e.originalTitle }),
    ...(e.data?.productionYear && { year: e.data.productionYear }),
    ...(directors.length && { directors }),
    ...(runtime && { runtimeMinutes: runtime }),
    externalIds: {},
    refs: [refOf(e.internalId)],
  };
}

/** Convertit une page de réponse en entrées pivot. Les identifiants de nœud (qui contiennent l'ID utilisateur) sont ignorés. */
export function parseMoviesRated(data: MoviesRatedResponse, fetchedAt: string): Page<PivotEntry> {
  const conn = data.me?.user?.social.relatedEntities.moviesSeen;
  if (!conn) throw new LocalizedError(msg('err.noRatingList', { platform: 'AlloCiné' }));

  const items: PivotEntry[] = [];
  for (const { node } of conn.edges) {
    const work = node.entity && workOf(node.entity);
    if (!work) continue;
    const rating = node.opinion?.content?.rating;
    const entry: PivotEntry = { work, source: { platform: 'allocine', fetchedAt } };
    if (typeof rating === 'number' && rating > 0) entry.rating = { value: rating, scale: SCALES.halfStarsOf5 };
    items.push(entry);
  }
  return {
    items,
    nextCursor: conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null,
    total: conn.totalCount,
  };
}

export function parseSearch(data: SearchResponse): Candidate[] {
  return (data.search?.edges ?? [])
    .map((e) => e.node?.node && workOf(e.node.node))
    .filter((w): w is PivotWork => !!w)
    .map((work) => ({ ref: work.refs[0]!, work }));
}

/**
 * Lien du mode « à la main » : fiche exacte si le film vient déjà d'AlloCiné, sinon la page de recherche
 * du site (vérifiée : /rechercher/movie/?q=…). La recherche porte sur le titre affiché, sans l'année,
 * qui perturberait les résultats ; AlloCiné indexe aussi les titres originaux.
 */
export function manualLink(work: PivotWork): { url: string; exact: boolean } {
  const ref = work.refs.find((r) => r.platform === 'allocine');
  if (ref) return { url: filmUrl(ref.id), exact: true };
  return { url: `https://www.allocine.fr/rechercher/movie/?q=${encodeURIComponent(work.title)}`, exact: false };
}

/** `https://www.allocine.fr/film/fichefilm_gen_cfilm=12551.html` → id 12551. */
export function parseAcUrl(url: string): PlatformRef | null {
  try {
    const u = new URL(url.trim());
    if (!/(^|\.)allocine\.fr$/.test(u.hostname)) return null;
    const m = /fichefilm(?:_gen_cfilm=|-)(\d+)/.exec(u.pathname);
    return m ? refOf(Number(m[1])) : null;
  } catch {
    return null;
  }
}
