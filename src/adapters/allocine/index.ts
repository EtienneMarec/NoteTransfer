import type { AdapterContext, Candidate, PlatformAdapter } from '../../core/adapter';
import { isValidRating } from '../../core/convert';
import { PauseError } from '../../core/errors';
import { msg } from '../../core/i18n';
import { gql } from '../../core/graphql';
import { titleSimilarity } from '../../core/match/normalize';
import { HOST_PERMISSIONS } from '../../core/permissions';
import { SCALES } from '../../core/scales';
import {
  entityIdOf,
  manualLink,
  parseAcUrl,
  parseMoviesRated,
  parseSearch,
  workOf,
  type AcMovie,
  type MoviesRatedResponse,
  type SearchResponse,
} from './parse';
import { ADD_OPINION, GRAPH_ENDPOINT, MAINTENANCE_URL, ME, MOVIE, MOVIES_RATED, OPINION, PAGE_SIZE, SEARCH, SEARCH_SIZE } from './queries';

const LOGIN_URL = 'https://mon.allocine.fr/connexion/';

type OpinionResponse = {
  me: { user: { social: { entities: { edges: Array<{ node: { opinion: { content: { rating: number | null; review: string | null } | null } | null } }> } } } | null } | null;
};

async function opinionOf(ctx: AdapterContext, internalId: string) {
  const data = await gql<OpinionResponse>(ctx, GRAPH_ENDPOINT, OPINION, { ids: [entityIdOf(internalId)] });
  if (!data.me?.user) throw new PauseError('signed_out', msg('err.signedOut'));
  return data.me.user.social.entities.edges[0]?.node.opinion?.content ?? null;
}

async function search(ctx: AdapterContext, text: string): Promise<Candidate[]> {
  return parseSearch(await gql<SearchResponse>(ctx, GRAPH_ENDPOINT, SEARCH, { text, first: SEARCH_SIZE }));
}

export const allocine: PlatformAdapter = {
  id: 'allocine',
  displayName: 'AlloCiné',
  hostPermissions: HOST_PERMISSIONS.allocine,
  capabilities: {
    read: 'site',
    write: 'site',
    scale: SCALES.halfStarsOf5,
    kinds: ['movie'],
    providesExternalIds: [],
    lookupByExternalId: [],
    notes: {
      fr: 'Lecture et écriture de vos notes via l’API interne du site, depuis un onglet AlloCiné. Pas de date de notation.',
      en: 'Reads and writes your ratings through the site’s internal API, from an AlloCiné tab. No rating dates.',
    },
    writeSideEffects: {
      fr: 'Un film qui a déjà une critique sur AlloCiné n’est jamais modifié, pour ne pas risquer de la perdre : changez sa note à la main.',
      en: 'A film that already has a review on AlloCiné is never changed, so the review cannot be lost: change its rating by hand.',
    },
    termsWarning: {
      fr:
        'Les CGU d’AlloCiné interdisent toute extraction automatisée de données, même partielle (art. 7.5), ' +
        'et les systèmes automatisés envoyant plus de requêtes qu’un humain (art. 8.1). AlloCiné peut suspendre ' +
        'un compte sans préavis (art. 9). L’extension ne lit et n’écrit que vos propres notes, lentement, mais ce risque ' +
        'existe. En continuant, vous l’acceptez.',
      en:
        'AlloCiné’s terms of use forbid any automated data extraction, even partial (art. 7.5), and automated systems ' +
        'sending more requests than a human would (art. 8.1). AlloCiné may suspend an account without notice (art. 9). ' +
        'The extension only reads and writes your own ratings, slowly, but this risk exists. By continuing, you accept it.',
    },
  },
  site: {
    homeUrl: 'https://mon.allocine.fr/mes-films/vus/',
    tabPatterns: ['https://mon.allocine.fr/*'],
    auth: { cookie: 'GraphToken', header: 'Authorization', prefix: 'Bearer ' },
    loginUrl: LOGIN_URL,
  },
  manualWrite: {
    linkFor: manualLink,
    instructions: {
      fr:
        'Ouvrez chaque lien, choisissez le bon film dans la recherche AlloCiné (titre, année, réalisateur), ' +
        'mettez la note indiquée, puis cochez « Fait ». AlloCiné n’ayant pas d’export, l’extension ne peut pas ' +
        'repérer les films que vous avez déjà notés : vérifiez la note affichée sur la fiche avant de la changer.',
      en:
        'Open each link, pick the right film in the AlloCiné search (title, year, director), set the rating shown, ' +
        'then tick “Done”. AlloCiné has no export, so the extension cannot spot films you already rated: check the ' +
        'rating shown on the page before changing it.',
    },
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

  async searchFilm(ctx, q) {
    const byId = new Map<string, Candidate>();
    for (const c of await search(ctx, q.title)) byId.set(c.ref.id, c);
    // Titre source étranger (Letterboxd, IMDb) : on cherche aussi le titre original.
    const close = [...byId.values()].some((c) => titleSimilarity(q.title, c.work.title) >= 0.9 || titleSimilarity(q.title, c.work.originalTitle ?? '') >= 0.9);
    if (q.originalTitle && q.originalTitle !== q.title && !close) {
      for (const c of await search(ctx, q.originalTitle)) if (!byId.has(c.ref.id)) byId.set(c.ref.id, c);
    }
    return [...byId.values()];
  },

  parseUrl: parseAcUrl,

  async getFilm(ctx, ref) {
    const data = await gql<{ movie: AcMovie | null }>(ctx, GRAPH_ENDPOINT, MOVIE, { internalId: Number(ref.id) });
    const work = data.movie && workOf(data.movie);
    return work ? { ref: work.refs[0]!, work } : null;
  },

  async getExistingRating(ctx, ref) {
    const content = await opinionOf(ctx, ref.id);
    const rating = content?.rating;
    return typeof rating === 'number' && rating > 0 ? { value: rating, scale: SCALES.halfStarsOf5 } : null;
  },

  async writeRating(ctx, ref, value) {
    // AlloCiné arrondit en silence une note invalide (3,3 → 3) : on refuse avant d'envoyer.
    if (!isValidRating(value, SCALES.halfStarsOf5)) {
      return { ok: false, retryable: false, reason: msg('write.invalidHalfStars', { value, platform: 'AlloCiné' }) };
    }
    const maintenance = await ctx.http.request({ url: MAINTENANCE_URL, expectJson: true }, ctx.signal);
    if (/"socialApiMaintenance"\s*:\s*true/.test(maintenance.body)) {
      throw new PauseError('network', msg('err.maintenance', { platform: 'AlloCiné' }));
    }
    const existing = await opinionOf(ctx, ref.id);
    if (existing?.review) {
      return { ok: false, retryable: false, reason: msg('write.hasReview') };
    }
    const data = await gql<{ addUserOpinion: { userEntityLeaf: { opinion: { content: { rating: number | null } | null } | null } | null } | null }>(
      ctx,
      GRAPH_ENDPOINT,
      ADD_OPINION,
      { id: entityIdOf(ref.id), rating: value },
    );
    const saved = data.addUserOpinion?.userEntityLeaf?.opinion?.content?.rating;
    return saved === value ? { ok: true } : { ok: false, retryable: false, reason: msg('write.unexpected', { value: saved ?? msg('write.missing') }) };
  },
};
