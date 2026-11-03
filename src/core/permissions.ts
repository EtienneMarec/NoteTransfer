/**
 * Origines demandées par plateforme. Elles sont déclarées en `optional_host_permissions`
 * et demandées à l'exécution, uniquement quand l'utilisateur choisit la plateforme.
 * IMDb et Letterboxd n'en ont pas : ils fonctionnent par fichiers.
 */
export const HOST_PERMISSIONS = {
  allocine: ['https://www.allocine.fr/*', 'https://mon.allocine.fr/*', 'https://graph.allocine.fr/*'],
  senscritique: ['https://www.senscritique.com/*', 'https://apollo.senscritique.com/*'],
  letterboxd: [],
  imdb: [],
  trakt: ['https://api.trakt.tv/*'],
  tmdb: ['https://api.themoviedb.org/*'],
} as const satisfies Record<string, readonly string[]>;

export const OPTIONAL_HOST_PERMISSIONS: string[] = [...new Set(Object.values(HOST_PERMISSIONS).flat())];
