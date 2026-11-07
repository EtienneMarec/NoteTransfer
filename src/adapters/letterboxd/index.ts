import { LocalizedError, msg } from '../../core/i18n';
import type { ImportFile, PlatformAdapter } from '../../core/adapter';
import { csvRecords, pick } from '../../core/files/csv';
import { isZip, readZipText } from '../../core/files/zip';
import { HOST_PERMISSIONS } from '../../core/permissions';
import type { PivotEntry, PivotWork } from '../../core/pivot';
import { SCALES } from '../../core/scales';

/** L'importeur refuse les fichiers de plus de 1 Mo : on découpe un peu avant. */
export const MAX_IMPORT_BYTES = 950_000;
/** Limite affichée sur letterboxd.com/import (vérifiée le 2026-11-03) : 1 900 titres par fichier. */
export const MAX_IMPORT_ROWS = 1_900;

// ---- Lecture : export officiel (ZIP ou ratings.csv) -------------------------------------
// Colonnes vérifiées sur un export réel (2026-11-03) : Date, Name, Year, Letterboxd URI, Rating.
// « Name » est le titre affiché par Letterboxd (souvent anglais : « Breathless » pour « À bout de souffle »).

export function parseLetterboxdRatings(text: string, fetchedAt: string): PivotEntry[] {
  const { columns, records } = csvRecords(text);
  if (!columns.includes('name') || !columns.includes('rating')) {
    throw new LocalizedError(msg('file.notLetterboxd'));
  }
  const entries: PivotEntry[] = [];
  for (const r of records) {
    const title = pick(r, 'Name');
    const uri = pick(r, 'Letterboxd URI', 'URL');
    const value = Number(pick(r, 'Rating'));
    if (!title || !uri) continue;
    const year = Number(pick(r, 'Year'));
    const ratedAt = pick(r, 'Date');
    const entry: PivotEntry = {
      work: {
        kind: 'movie',
        title,
        ...(Number.isInteger(year) && year > 1800 && { year }),
        externalIds: {},
        refs: [{ platform: 'letterboxd', id: uri, url: uri }],
      },
      source: { platform: 'letterboxd', fetchedAt },
    };
    if (value >= 0.5 && value <= 5 && Number.isInteger(value * 2)) {
      entry.rating = { value, scale: SCALES.halfStarsOf5, ...(ratedAt && { ratedAt }) };
    }
    entries.push(entry);
  }
  return entries;
}

async function exportText(file: { name: string; bytes: Uint8Array }): Promise<string> {
  if (!isZip(file.bytes)) return new TextDecoder().decode(file.bytes);
  const text = await readZipText(file.bytes, (n) => n === 'ratings.csv' || n.endsWith('/ratings.csv'));
  if (text === undefined) throw new LocalizedError(msg('file.zipWithoutRatings'));
  return text;
}

// ---- Écriture : fichier pour l'importeur officiel --------------------------------------
// Format documenté sur https://letterboxd.com/about/importing-data/ : virgule sans espace,
// guillemets échappés par une barre oblique inverse.

function cell(v: string | number | undefined): string {
  if (v === undefined || v === '') return '';
  const s = String(v).replace(/[\r\n]+/g, ' ');
  return /[",]/.test(s) ? `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : s;
}

export function buildLetterboxdImport(rows: Array<{ work: PivotWork; value: number }>): ImportFile[] {
  const withImdb = rows.some((r) => r.work.externalIds.imdb);
  const withTmdb = rows.some((r) => r.work.externalIds.tmdb);
  const header = [...(withImdb ? ['imdbID'] : []), ...(withTmdb ? ['tmdbID'] : []), 'Title', 'Year', 'Directors', 'Rating'];
  const line = ({ work: w, value }: { work: PivotWork; value: number }) =>
    [
      ...(withImdb ? [cell(w.externalIds.imdb)] : []),
      ...(withTmdb ? [cell(w.externalIds.tmdb)] : []),
      // Letterboxd affiche surtout les titres originaux : c'est le meilleur indice pour son rapprochement.
      cell(w.originalTitle ?? w.title),
      cell(w.year),
      cell(w.directors?.join(', ')),
      cell(value),
    ].join(',');

  const encoder = new TextEncoder();
  const headerLine = header.join(',');
  const files: string[][] = [];
  let current: string[] = [];
  let size = encoder.encode(headerLine).length + 1;
  for (const r of rows) {
    const l = line(r);
    const bytes = encoder.encode(l).length + 1;
    if (current.length && (size + bytes > MAX_IMPORT_BYTES || current.length >= MAX_IMPORT_ROWS)) {
      files.push(current);
      current = [];
      size = encoder.encode(headerLine).length + 1;
    }
    current.push(l);
    size += bytes;
  }
  if (current.length) files.push(current);

  return files.map((lines, i) => ({
    name: files.length > 1 ? `letterboxd-import-${i + 1}.csv` : 'letterboxd-import.csv',
    mimeType: 'text/csv;charset=utf-8',
    content: [headerLine, ...lines].join('\n') + '\n',
  }));
}

export const letterboxd: PlatformAdapter = {
  id: 'letterboxd',
  displayName: 'Letterboxd',
  hostPermissions: HOST_PERMISSIONS.letterboxd,
  capabilities: {
    read: 'file',
    write: 'file',
    scale: SCALES.halfStarsOf5,
    kinds: ['movie'],
    providesExternalIds: [],
    lookupByExternalId: ['imdb', 'tmdb'],
    notes: {
      fr: 'Par les fichiers officiels d’export et d’import. Aucune requête n’est envoyée à Letterboxd.',
      en: 'Through the official export and import files. No request is sent to Letterboxd.',
    },
    writeSideEffects: {
      fr:
        'Letterboxd fait lui-même le rapprochement des films et remplace sans prévenir une note déjà présente. ' +
        'Les films importés sont aussi marqués comme vus. Vérifiez son récapitulatif avant de confirmer : l’import ne peut pas être annulé. ' +
        'L’importeur est normalement réservé aux membres Pro (ouvert à tous pour une durée limitée en novembre 2026).',
      en:
        'Letterboxd matches the films itself and silently replaces an existing rating. ' +
        'Imported films are also marked as watched. Check its summary before confirming: an import cannot be undone. ' +
        'The importer is normally reserved for Pro members (open to everyone for a limited time in November 2026).',
    },
  },
  exportFileTypes: '.zip,.csv,application/zip,text/csv',
  exportInstructions: {
    fr:
      'Sur letterboxd.com, ouvrez Settings → Data → Export your data. Choisissez ici le fichier ZIP téléchargé, ' +
      'ou le fichier ratings.csv qu’il contient.',
    en: 'On letterboxd.com, open Settings → Data → Export your data. Choose the downloaded ZIP file here, or the ratings.csv file inside it.',
  },
  importInstructions: {
    fr:
      '1. Connectez-vous à Letterboxd et ouvrez https://letterboxd.com/import/. ' +
      '2. Choisissez le fichier généré (un par un s’il y en a plusieurs). ' +
      '3. Vérifiez le récapitulatif : Letterboxd y signale les films non trouvés ou ambigus, que vous pouvez corriger. ' +
      '4. Confirmez l’import.',
    en:
      '1. Sign in to Letterboxd and open https://letterboxd.com/import/. ' +
      '2. Choose the generated file (one at a time if there are several). ' +
      '3. Check the summary: Letterboxd flags films it could not find or that are ambiguous, which you can fix. ' +
      '4. Confirm the import.',
  },

  async checkSession() {
    return { state: 'ok', displayName: 'fichiers' };
  },

  async parseExport(file) {
    return parseLetterboxdRatings(await exportText(file), new Date().toISOString());
  },

  buildImportFiles: buildLetterboxdImport,
};
