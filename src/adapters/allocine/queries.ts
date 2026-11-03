// Requêtes vérifiées sur le vrai site le 2026-11-03 (voir docs/platforms/allocine.md).
export const GRAPH_ENDPOINT = 'https://graph.allocine.fr/v1/public';
/** Interrogé par le site avant toute écriture ; renvoie {"socialApiMaintenance": false}. */
export const MAINTENANCE_URL = 'https://mon.allocine.fr/_/maintenance/social';

const MOVIE_FIELDS = /* GraphQL */ `
  internalId title originalTitle data { productionYear } runtime
  credits(department: DIRECTION) { edges { node { person { firstName lastName } } } }
`;

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
          entity { __typename ... on Movie { id ${MOVIE_FIELDS} } }
          opinion { content { rating(base: 5) } }
        } }
      }
    } } } }
  }
`;

export const SEARCH = /* GraphQL */ `
  query NotesTransfertSearch($text: String!, $first: Int) {
    search(text: $text, types: [Movie], first: $first) {
      edges { node { node { __typename ... on Movie { ${MOVIE_FIELDS} } } } }
    }
  }
`;

export const MOVIE = /* GraphQL */ `
  query NotesTransfertMovie($internalId: Int) {
    movie(internalId: $internalId) { __typename ${MOVIE_FIELDS} }
  }
`;

/** Note et critique de l'utilisateur pour un film (vide si aucun avis). */
export const OPINION = /* GraphQL */ `
  query NotesTransfertOpinion($ids: [String]!) {
    me { user { social { entities(entity: $ids, action: [OPINION]) {
      edges { node { opinion { content { rating(base: 5) review } } } }
    } } } }
  }
`;

/** Crée ou remplace l'avis (vérifié : un second ajout remplace la note, sans doublon). */
export const ADD_OPINION = /* GraphQL */ `
  mutation NotesTransfertRate($id: String!, $rating: Float) {
    addUserOpinion(input: { id_entity: $id, rating: $rating }) {
      userEntityLeaf { opinion { content { rating(base: 5) } } }
    }
  }
`;

/** Taille de page utilisée par le site lui-même. */
export const PAGE_SIZE = 30;
/** Le bon film n'est pas toujours en tête (MIIB arrive 4e pour « Men in Black II »). */
export const SEARCH_SIZE = 10;
