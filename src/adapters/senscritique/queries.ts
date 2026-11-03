// Requêtes vérifiées sur le vrai site le 2026-11-03 (voir docs/platforms/senscritique.md).
// Le serveur rejette toute requête contenant un champ inconnu : garder les sélections minimales.
export const APOLLO_ENDPOINT = 'https://apollo.senscritique.com/';

export const ME = /* GraphQL */ `
  query NotesTransfertMe { me { username } }
`;

export const SEARCH = /* GraphQL */ `
  query NotesTransfertSearch($keywords: String!, $universe: String, $limit: Int) {
    searchAutocomplete(keywords: $keywords, universe: $universe, limit: $limit) {
      items { product { id title originalTitle dateRelease dateReleaseOriginal universe url } }
    }
  }
`;

/** Détails de plusieurs produits en une seule requête, via des alias p0, p1… */
export function productDetails(count: number): string {
  const vars = Array.from({ length: count }, (_, i) => `$id${i}: Int!`).join(', ');
  const fields = Array.from(
    { length: count },
    (_, i) => `p${i}: product(id: $id${i}) { id title originalTitle yearOfProduction duration universe url directors { name } }`,
  ).join('\n');
  return `query NotesTransfertProducts(${vars}) {\n${fields}\n}`;
}

export const CURRENT_USER_RATING = /* GraphQL */ `
  query NotesTransfertRating($id: Int!) {
    product(id: $id) { id currentUserInfos { rating } }
  }
`;

export const PRODUCT_RATE = /* GraphQL */ `
  mutation NotesTransfertRate($productId: Int!, $rating: Int!) {
    productRate(productId: $productId, rating: $rating) { id currentUserInfos { rating } }
  }
`;

export const COLLECTION = /* GraphQL */ `
  query NotesTransfertCollection($username: String!, $limit: Int, $offset: Int) {
    user(username: $username) {
      collection(universe: "movie", limit: $limit, offset: $offset) {
        total
        products {
          id title originalTitle yearOfProduction duration url directors { name }
          otherUserInfos(username: $username) { rating dateDone }
        }
      }
    }
  }
`;

export const COLLECTION_PAGE_SIZE = 50;
/** Nombre maximal de candidats dont on récupère les détails (réalisateur, durée). */
export const MAX_DETAILED_CANDIDATES = 5;
