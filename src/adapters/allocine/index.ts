import type { PlatformAdapter } from '../../core/adapter';
import { gql } from '../../core/graphql';
import { HOST_PERMISSIONS } from '../../core/permissions';
import { SCALES } from '../../core/scales';
import { parseMoviesRated, type MoviesRatedResponse } from './parse';
import { GRAPH_ENDPOINT, ME, MOVIES_RATED, PAGE_SIZE } from './queries';

const LOGIN_URL = 'https://mon.allocine.fr/connexion/';

export const allocine: PlatformAdapter = {
  id: 'allocine',
  displayName: 'AlloCiné',
  hostPermissions: HOST_PERMISSIONS.allocine,
  capabilities: {
    read: 'site',
    // L'écriture existe côté site mais n'est pas encore vérifiée (risque d'effacer une critique).
    write: null,
    scale: SCALES.halfStarsOf5,
    kinds: ['movie'],
    providesExternalIds: [],
    lookupByExternalId: [],
    notes: 'Lecture de vos notes via l’API interne du site, depuis un onglet AlloCiné. Pas de date de notation.',
    termsWarning:
      'Les CGU d’AlloCiné interdisent toute extraction automatisée de données, même partielle (art. 7.5), ' +
      'et les systèmes automatisés envoyant plus de requêtes qu’un humain (art. 8.1). AlloCiné peut suspendre ' +
      'un compte sans préavis (art. 9). L’extension lit uniquement vos propres notes, lentement, mais ce risque ' +
      'existe. En continuant, vous l’acceptez.',
  },
  site: {
    homeUrl: 'https://mon.allocine.fr/mes-films/vus/',
    tabPatterns: ['https://mon.allocine.fr/*'],
    auth: { cookie: 'GraphToken', header: 'Authorization', prefix: 'Bearer ' },
    loginUrl: LOGIN_URL,
  },

  async checkSession(ctx) {
    const data = await gql<{ me: { user: { nickname?: string } | null } | null }>(ctx, GRAPH_ENDPOINT, ME).catch((e) => {
      if (e?.kind === 'signed_out') return { me: null };
      throw e;
    });
    const user = data.me?.user;
    return user ? { state: 'ok', ...(user.nickname && { displayName: user.nickname }) } : { state: 'signed_out', loginUrl: LOGIN_URL };
  },

  async readRatings(ctx, cursor) {
    const data = await gql<MoviesRatedResponse>(ctx, GRAPH_ENDPOINT, MOVIES_RATED, {
      first: PAGE_SIZE,
      ...(cursor && { after: cursor }),
    });
    return parseMoviesRated(data, new Date().toISOString());
  },
};
