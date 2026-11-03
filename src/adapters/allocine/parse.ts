import type { Page } from '../../core/adapter';
import { isoDurationToMinutes } from '../../core/graphql';
import type { PivotEntry } from '../../core/pivot';
import { SCALES } from '../../core/scales';

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
                entity: {
                  __typename: string;
                  internalId?: number;
                  title?: string;
                  originalTitle?: string | null;
                  data?: { productionYear?: number | null } | null;
                  runtime?: string | null;
                  credits?: { edges: Array<{ node: { person: { firstName?: string | null; lastName?: string | null } | null } }> } | null;
                } | null;
                opinion: { content: { rating: number | null } | null } | null;
              };
            }>;
          };
        };
      };
    } | null;
  } | null;
}

export const filmUrl = (id: number | string) => `https://www.allocine.fr/film/fichefilm_gen_cfilm=${id}.html`;

/** Convertit une page de réponse en entrées pivot. Les identifiants de nœud (qui contiennent l'ID utilisateur) sont ignorés. */
export function parseMoviesRated(data: MoviesRatedResponse, fetchedAt: string): Page<PivotEntry> {
  const conn = data.me?.user?.social.relatedEntities.moviesSeen;
  if (!conn) throw new Error('Réponse AlloCiné sans liste de films (session absente ?)');

  const items: PivotEntry[] = [];
  for (const { node } of conn.edges) {
    const e = node.entity;
    if (!e || e.__typename !== 'Movie' || e.internalId === undefined || !e.title) continue;
    const directors = (e.credits?.edges ?? [])
      .map(({ node: n }) => [n.person?.firstName, n.person?.lastName].filter(Boolean).join(' '))
      .filter(Boolean);
    const rating = node.opinion?.content?.rating;
    const entry: PivotEntry = {
      work: {
        kind: 'movie',
        title: e.title,
        ...(e.originalTitle && { originalTitle: e.originalTitle }),
        ...(e.data?.productionYear && { year: e.data.productionYear }),
        ...(directors.length && { directors }),
        ...(isoDurationToMinutes(e.runtime) && { runtimeMinutes: isoDurationToMinutes(e.runtime) }),
        externalIds: {},
        refs: [{ platform: 'allocine', id: String(e.internalId), url: filmUrl(e.internalId) }],
      },
      source: { platform: 'allocine', fetchedAt },
    };
    if (typeof rating === 'number' && rating > 0) entry.rating = { value: rating, scale: SCALES.halfStarsOf5 };
    items.push(entry);
  }
  return {
    items,
    nextCursor: conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null,
    total: conn.totalCount,
  };
}
