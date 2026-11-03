import type { PlatformAdapter } from '../../core/adapter';
import { csvRecords, pick } from '../../core/files/csv';
import { HOST_PERMISSIONS } from '../../core/permissions';
import type { PivotEntry } from '../../core/pivot';
import { SCALES } from '../../core/scales';

// En-têtes de l'export « Your Ratings » (sources tierces, à confirmer sur un export réel).
// Les noms sont comparés sans casse ni ponctuation : « Your Rating » = « your rating ».
const MOVIE_TYPES = new Set(['movie', 'tvmovie', 'video']);

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
    const type = (pick(r, 'Title Type') ?? 'movie').toLowerCase().replace(/[^a-z]/g, '');
    if (!id || !/^tt\d+$/.test(id) || !MOVIE_TYPES.has(type)) continue;
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

export const imdb: PlatformAdapter = {
  id: 'imdb',
  displayName: 'IMDb',
  hostPermissions: HOST_PERMISSIONS.imdb,
  capabilities: {
    read: 'file',
    // IMDb ne propose aucun import de notes, et ses conditions interdisent l'automatisation du site.
    write: null,
    scale: SCALES.integersOf10,
    kinds: ['movie'],
    providesExternalIds: ['imdb'],
    lookupByExternalId: [],
    notes: 'À partir du fichier CSV exporté depuis IMDb. Aucune requête n’est envoyée à IMDb.',
  },
  exportFileTypes: '.csv,text/csv',
  exportInstructions:
    'Sur imdb.com, ouvrez « Vos notes » (menu de votre compte), puis le menu ⋮ et « Exporter ». ' +
    'Téléchargez le fichier CSV depuis la page des exports, puis choisissez-le ici.',

  async checkSession() {
    return { state: 'ok', displayName: 'fichier d’export' };
  },

  async parseExport({ bytes }) {
    return parseImdbRatings(new TextDecoder().decode(bytes), new Date().toISOString());
  },
};
