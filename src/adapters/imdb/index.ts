import type { AdapterContext, Candidate, PlatformAdapter } from '../../core/adapter';
import { PauseError } from '../../core/errors';
import { csvRecords, pick } from '../../core/files/csv';
import { gql } from '../../core/graphql';
import { titleSimilarity } from '../../core/match/normalize';
import { candidateOf, manualLink, parseImdbUrl, parseSearch, refOf, type ImdbTitle } from './parse';
import { GRAPHQL_ENDPOINT, RATE, SEARCH, SEARCH_SIZE, SESSION_PROBE_ID, TITLE, USER_RATING } from './queries';
import { HOST_PERMISSIONS } from '../../core/permissions';
import type { PivotEntry } from '../../core/pivot';
import { SCALES } from '../../core/scales';

// En-têtes de l'export « Your Ratings », vérifiés sur un export réel le 2026-11-03.
// Les noms sont comparés sans casse ni ponctuation : « Your Rating » = « your rating ».
// « Title Type » est traduit dans la langue du compte (« Film » en français) : on exclut
// donc les types qui ne sont pas des films, plutôt que de lister ceux qui en sont.
const NOT_A_MOVIE = /series|serie|episode|mini|show|podcast|game|jeu|emission/;

const toInt = (s: string | undefined) => (s && /^\d+$/.test(s) ? Number(s) : undefined);

export function parseImdbRatings(text: string, fetchedAt: string): PivotEntry[] {
  const { columns, records } = csvRecords(text);
  if (!columns.includes('const') || !columns.includes('yourrating')) {
    throw new Error('Fichier non reconnu : il faut l’export « Your Ratings » d’IMDb (colonnes Const et Your Rating).');
  }
  const entries: PivotEntry[] = [];
  for (const r of records) {
    const id = pick(r, 'Const');
    const rating = toInt(pick(r, 'Your Rating'));
    const type = (pick(r, 'Title Type') ?? '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
    if (!id || !/^tt\d+$/.test(id) || NOT_A_MOVIE.test(type)) continue;
    const title = pick(r, 'Title') ?? id;
    const original = pick(r, 'Original Title');
    const year = toInt(pick(r, 'Year'));
    const runtime = toInt(pick(r, 'Runtime (mins)', 'Runtime'));
    const directors = (pick(r, 'Directors') ?? '').split(',').map((d) => d.trim()).filter(Boolean);
    const ratedAt = pick(r, 'Date Rated');
    const entry: PivotEntry = {
      work: {
        kind: 'movie',
        title,
        ...(original && { originalTitle: original }),
        ...(year && { year }),
        ...(directors.length && { directors }),
        ...(runtime && { runtimeMinutes: runtime }),
        externalIds: { imdb: id },
        refs: [{ platform: 'imdb', id, url: `https://www.imdb.com/title/${id}/` }],
      },
      source: { platform: 'imdb', fetchedAt },
    };
    if (rating && rating >= 1 && rating <= 10) {
      entry.rating = { value: rating, scale: SCALES.integersOf10, ...(ratedAt && { ratedAt }) };
    }
    entries.push(entry);
  }
  return entries;
}

const gqlImdb = <T>(ctx: AdapterContext, query: string, variables: object) => gql<T>(ctx, GRAPHQL_ENDPOINT, query, variables);

export const imdb: PlatformAdapter = {
  id: 'imdb',
  displayName: 'IMDb',
  hostPermissions: HOST_PERMISSIONS.imdb,
  capabilities: {
    read: 'file',
    // Pas d'import officiel : écriture par l'API interne du site (avertissement), ou « à la main ».
    write: 'site',
    scale: SCALES.integersOf10,
    kinds: ['movie'],
    providesExternalIds: ['imdb'],
    lookupByExternalId: ['imdb'],
    notes: 'Lecture à partir du fichier CSV exporté depuis IMDb, sans requête vers IMDb.',
    termsWarning:
      'IMDb n’a pas d’API publique pour noter : l’extension utiliserait l’API interne du site. Les conditions d’IMDb ' +
      'interdisent les robots et outils d’extraction sans accord écrit, et IMDb peut retirer son autorisation à tout moment. ' +
      'Votre compte IMDb est souvent aussi votre compte Amazon : une sanction pourrait le toucher. ' +
      'Si vous ne voulez pas prendre ce risque, choisissez le mode « à la main ».',
    writeSideEffects: 'Une note IMDb ne peut pas valoir 0 : l’extension n’envoie que des notes de 1 à 10.',
  },
  site: {
    homeUrl: 'https://www.imdb.com/',
    tabPatterns: ['https://www.imdb.com/*'],
    credentials: 'include',
    loginUrl: 'https://www.imdb.com/registration/signin',
  },
  manualWrite: {
    linkFor: manualLink,
    instructions:
      'Ouvrez chaque lien, notez le film sur IMDb avec la note indiquée, puis cochez « Fait ». ' +
      'Pour un lien de recherche, choisissez vous-même le bon film (titre, année, réalisateur).',
  },
  exportFileTypes: '.csv,text/csv',
  exportInstructions:
    'Sur imdb.com, ouvrez « Vos notes » (menu de votre compte), puis le menu ⋮ et « Exporter ». ' +
    'Téléchargez le fichier CSV depuis la page des exports, puis choisissez-le ici.',

  async checkSession(ctx) {
    try {
      await gqlImdb(ctx, USER_RATING, { id: SESSION_PROBE_ID });
      return { state: 'ok' };
    } catch (e) {
      if (e instanceof PauseError && e.kind === 'signed_out') return { state: 'signed_out', loginUrl: imdb.site!.loginUrl };
      throw e;
    }
  },

  async parseExport({ bytes }) {
    return parseImdbRatings(new TextDecoder().decode(bytes), new Date().toISOString());
  },

  async searchFilm(ctx, q) {
    // ID IMDb connu (export IMDb, Letterboxd…) : correspondance exacte, sans recherche.
    if (q.externalIds.imdb) {
      const exact = await imdb.getFilm!(ctx, refOf(q.externalIds.imdb));
      if (exact) return [exact];
    }
    const byId = new Map<string, Candidate>();
    for (const text of [q.originalTitle, q.title].filter((t, i, all): t is string => !!t && all.indexOf(t) === i)) {
      for (const c of parseSearch(await gqlImdb(ctx, SEARCH, { text, first: SEARCH_SIZE }))) if (!byId.has(c.ref.id)) byId.set(c.ref.id, c);
      if ([...byId.values()].some((c) => titleSimilarity(text, c.work.title) >= 0.9 || titleSimilarity(text, c.work.originalTitle ?? '') >= 0.9)) break;
    }
    return [...byId.values()];
  },

  parseUrl: parseImdbUrl,

  async getFilm(ctx, ref) {
    const data = await gqlImdb<{ title: ImdbTitle | null }>(ctx, TITLE, { id: ref.id });
    return data.title ? candidateOf(data.title) : null;
  },

  async getExistingRating(ctx, ref) {
    const data = await gqlImdb<{ title: { userRating: { value: number } | null } | null }>(ctx, USER_RATING, { id: ref.id });
    const value = data.title?.userRating?.value;
    return typeof value === 'number' && value > 0 ? { value, scale: SCALES.integersOf10 } : null;
  },

  async writeRating(ctx, ref, value) {
    // 0 supprimerait la note : seules les valeurs entières de 1 à 10 sont envoyées.
    if (!Number.isInteger(value) || value < 1 || value > 10) {
      return { ok: false, retryable: false, reason: `note ${value} invalide pour IMDb (entier de 1 à 10)` };
    }
    const data = await gqlImdb<{ rateTitle: { rating: { value: number } | null } | null }>(ctx, RATE, { rating: value, titleId: ref.id });
    const saved = data.rateTitle?.rating?.value;
    return saved === value ? { ok: true } : { ok: false, retryable: false, reason: `réponse inattendue (note ${saved ?? 'absente'})` };
  },
};
