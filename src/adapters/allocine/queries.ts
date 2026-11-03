// Requêtes vérifiées sur le vrai site le 2026-11-03 (voir docs/platforms/allocine.md).
export const GRAPH_ENDPOINT = 'https://graph.allocine.fr/v1/public';

export const ME = /* GraphQL */ `
  query NotesTransfertMe {
    me { user { nickname } }
  }
`;

export const MOVIES_RATED = /* GraphQL */ `
  query NotesTransfertMoviesRated($first: Int, $after: String) {
    me { user { social { relatedEntities {
      moviesSeen: movies(first: $first, after: $after, action: [OPINION], order: [LATEST]) {
        totalCount
        pageInfo { endCursor hasNextPage }
        edges { node {
          entity { __typename ... on Movie {
            id internalId title originalTitle data { productionYear } runtime
            credits(department: DIRECTION) { edges { node { person { firstName lastName } } } }
          } }
          opinion { content { rating(base: 5) } }
        } }
      }
    } } } }
  }
`;

/** Taille de page utilisée par le site lui-même. */
export const PAGE_SIZE = 30;
