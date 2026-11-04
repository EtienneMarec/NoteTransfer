/**
 * Origines demandées par plateforme. Elles sont déclarées en `optional_host_permissions`
 * et demandées à l'exécution, uniquement quand l'utilisateur choisit la plateforme.
 * Letterboxd n'en a pas (fichiers). IMDb n'en a besoin que pour l'écriture automatique :
 * la lecture d'un export et le mode « à la main » n'envoient rien au site.
 */
export const HOST_PERMISSIONS = {
  allocine: ['https://www.allocine.fr/*', 'https://mon.allocine.fr/*', 'https://graph.allocine.fr/*'],
  senscritique: ['https://www.senscritique.com/*', 'https://apollo.senscritique.com/*'],
  letterboxd: [],
  imdb: ['https://www.imdb.com/*', 'https://api.graphql.imdb.com/*'],
} as const satisfies Record<string, readonly string[]>;

export const OPTIONAL_HOST_PERMISSIONS: string[] = [...new Set(Object.values(HOST_PERMISSIONS).flat())];
