// API GraphQL interne du site, vérifiée sur un compte de test le 2026-11-04 (voir docs/platforms/imdb.md).
// L'authentification se fait par les cookies du site : requêtes envoyées depuis un onglet imdb.com.
export const GRAPHQL_ENDPOINT = 'https://api.graphql.imdb.com/';

const TITLE_FIELDS = /* GraphQL */ `
  id titleText { text } originalTitleText { text } releaseYear { year } runtime { seconds }
  directors: credits(first: 3, filter: { categories: ["director"] }) { edges { node { name { nameText { text } } } } }
`;

export const SEARCH = /* GraphQL */ `
  query NotesTransfertSearch($text: String!, $first: Int!) {
    mainSearch(first: $first, options: { searchTerm: $text, type: TITLE, titleSearchOptions: { type: [MOVIE] } }) {
      edges { node { entity { ... on Title { ${TITLE_FIELDS} } } } }
    }
  }
`;

export const TITLE = /* GraphQL */ `
  query NotesTransfertTitle($id: ID!) {
    title(id: $id) { ${TITLE_FIELDS} }
  }
`;

/** Sans session : erreur FORBIDDEN « Authentication required ». */
export const USER_RATING = /* GraphQL */ `
  query NotesTransfertRating($id: ID!) {
    title(id: $id) { userRating { value } }
  }
`;

/** Attention : rating = 0 SUPPRIME la note (vérifié). Ne jamais l'envoyer. */
export const RATE = /* GraphQL */ `
  mutation NotesTransfertRate($rating: Int!, $titleId: ID!) {
    rateTitle(input: { rating: $rating, titleId: $titleId }) { rating { value } }
  }
`;

/** Titre public servant à vérifier la session (lecture de la note de l'utilisateur). */
export const SESSION_PROBE_ID = 'tt0111161';
export const SEARCH_SIZE = 8;
