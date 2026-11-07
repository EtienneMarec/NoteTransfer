import { PauseError } from '../../core/errors';
import { LocalizedError, msg } from '../../core/i18n';
import type { AdapterContext, Candidate, PlatformAdapter, WorkQuery } from '../../core/adapter';
import { gql } from '../../core/graphql';
import { titleSimilarity } from '../../core/match/normalize';
import { HOST_PERMISSIONS } from '../../core/permissions';
import { SCALES } from '../../core/scales';
import {
  candidateFromProduct,
  candidateFromSearch,
  entryFromCollection,
  MOVIE_UNIVERSE,
  parseScUrl,
  type ScProduct,
  type ScSearchProduct,
} from './parse';
import {
  APOLLO_ENDPOINT,
  COLLECTION,
  COLLECTION_PAGE_SIZE,
  CURRENT_USER_RATING,
  MAX_DETAILED_CANDIDATES,
  ME,
  PRODUCT_RATE,
  productDetails,
  SEARCH,
} from './queries';

const LOGIN_URL = 'https://www.senscritique.com/';

async function search(ctx: AdapterContext, keywords: string): Promise<Candidate[]> {
  const data = await gql<{ searchAutocomplete: { items: Array<{ product: ScSearchProduct | null }> } | null }>(
    ctx,
    APOLLO_ENDPOINT,
    SEARCH,
    { keywords, universe: 'movie', limit: 8 },
  );
  return (data.searchAutocomplete?.items ?? [])
    .map((i) => i.product)
    .filter((p): p is ScSearchProduct => !!p && p.universe === MOVIE_UNIVERSE)
    .map(candidateFromSearch);
}

async function details(ctx: AdapterContext, ids: number[]): Promise<Candidate[]> {
  if (!ids.length) return [];
  const variables = Object.fromEntries(ids.map((id, i) => [`id${i}`, id]));
  const data = await gql<Record<string, ScProduct | null>>(ctx, APOLLO_ENDPOINT, productDetails(ids.length), variables);
  return ids.map((_, i) => data[`p${i}`]).filter((p): p is ScProduct => !!p).map(candidateFromProduct);
}

/** Élimine tôt les candidats manifestement hors sujet, pour limiter les requêtes de détails. */
function plausible(q: WorkQuery, c: Candidate): number {
  const titles = [q.title, q.originalTitle].filter((t): t is string => !!t);
  const sim = Math.max(...titles.flatMap((t) => [titleSimilarity(t, c.work.title), titleSimilarity(t, c.work.originalTitle ?? '')]));
  const yearOk = !q.year || !c.work.year || Math.abs(q.year - c.work.year) <= 2;
  return yearOk ? sim : 0;
}

export const senscritique: PlatformAdapter = {
  id: 'senscritique',
  displayName: 'SensCritique',
  hostPermissions: HOST_PERMISSIONS.senscritique,
  capabilities: {
    read: 'site',
    write: 'site',
    scale: SCALES.integersOf10,
    kinds: ['movie'],
    providesExternalIds: [],
    lookupByExternalId: [],
    notes: {
      fr: 'Lecture et écriture via l’API interne du site, depuis un onglet SensCritique.',
      en: 'Reads and writes through the site’s internal API, from a SensCritique tab.',
    },
    writeSideEffects: {
      fr: 'Noter un film sur SensCritique le marque comme vu et le retire de vos envies.',
      en: 'Rating a film on SensCritique marks it as watched and removes it from your watchlist.',
    },
  },
  site: {
    homeUrl: 'https://www.senscritique.com/',
    tabPatterns: ['https://www.senscritique.com/*'],
    auth: { cookie: 'SC_AUTH', header: 'authorization', prefix: '' },
    loginUrl: LOGIN_URL,
  },

  async checkSession(ctx) {
    const data = await gql<{ me: { username: string } | null }>(ctx, APOLLO_ENDPOINT, ME).catch((e) => {
      if (e?.kind === 'signed_out') return { me: null };
      throw e;
    });
    return data.me ? { state: 'ok', displayName: data.me.username } : { state: 'signed_out', loginUrl: LOGIN_URL };
  },

  async readRatings(ctx, cursor) {
    const me = await gql<{ me: { username: string } | null }>(ctx, APOLLO_ENDPOINT, ME);
    if (!me.me) throw new PauseError('signed_out', msg('err.signedOut'));
    const offset = cursor ? Number(cursor) : 0;
    const data = await gql<{
      user: { collection: { total: number; products: Parameters<typeof entryFromCollection>[0][] } } | null;
    }>(ctx, APOLLO_ENDPOINT, COLLECTION, { username: me.me.username, limit: COLLECTION_PAGE_SIZE, offset });
    const col = data.user?.collection;
    if (!col) throw new LocalizedError(msg('err.noCollection', { platform: 'SensCritique' }));
    const fetchedAt = new Date().toISOString();
    const next = offset + col.products.length;
    return {
      // La collection contient aussi des films sans note (vus, envies) : on ne garde que les notés.
      items: col.products.map((p) => entryFromCollection(p, fetchedAt)).filter((e) => e.rating),
      nextCursor: col.products.length > 0 && next < col.total ? String(next) : null,
      total: col.total,
    };
  },

  async searchFilm(ctx, q) {
    const byId = new Map<string, Candidate>();
    for (const c of await search(ctx, q.title)) byId.set(c.ref.id, c);
    const bestSoFar = Math.max(0, ...[...byId.values()].map((c) => plausible(q, c)));
    if (q.originalTitle && q.originalTitle !== q.title && bestSoFar < 0.9) {
      for (const c of await search(ctx, q.originalTitle)) if (!byId.has(c.ref.id)) byId.set(c.ref.id, c);
    }
    const shortlist = [...byId.values()]
      .map((c) => ({ c, s: plausible(q, c) }))
      .filter(({ s }) => s >= 0.5)
      .sort((a, b) => b.s - a.s)
      .slice(0, MAX_DETAILED_CANDIDATES)
      .map(({ c }) => Number(c.ref.id));
    return details(ctx, shortlist);
  },

  parseUrl: parseScUrl,

  async getFilm(ctx, ref) {
    const [c] = await details(ctx, [Number(ref.id)]);
    return c ?? null;
  },

  async getExistingRating(ctx, ref) {
    const data = await gql<{ product: { currentUserInfos: { rating: number | null } | null } | null }>(
      ctx,
      APOLLO_ENDPOINT,
      CURRENT_USER_RATING,
      { id: Number(ref.id) },
    );
    if (!data.product) throw new LocalizedError(msg('err.filmNotFound', { platform: 'SensCritique', id: ref.id }));
    const rating = data.product.currentUserInfos?.rating;
    return typeof rating === 'number' && rating > 0 ? { value: rating, scale: SCALES.integersOf10 } : null;
  },

  async writeRating(ctx, ref, value) {
    if (!Number.isInteger(value) || value < 1 || value > 10) {
      return { ok: false, retryable: false, reason: msg('write.invalidInteger', { value, platform: 'SensCritique' }) };
    }
    const data = await gql<{ productRate: { currentUserInfos: { rating: number | null } | null } | null }>(
      ctx,
      APOLLO_ENDPOINT,
      PRODUCT_RATE,
      { productId: Number(ref.id), rating: value },
    );
    const saved = data.productRate?.currentUserInfos?.rating;
    return saved === value ? { ok: true } : { ok: false, retryable: false, reason: msg('write.unexpected', { value: saved ?? msg('write.missing') }) };
  },
};
