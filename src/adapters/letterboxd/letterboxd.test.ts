import { describe, expect, it } from 'vitest';
import { makeZip } from '../../core/files/make-zip.testutil';
import { parseCsv } from '../../core/files/csv';
import type { PivotWork } from '../../core/pivot';
// Fixture SYNTHÉTIQUE : colonnes d'après des sources tierces, contenu inventé. À remplacer par un export réel anonymisé.
import fixture from './__fixtures__/ratings.synthetic.csv?raw';
import { buildLetterboxdImport, letterboxd, MAX_IMPORT_BYTES, parseLetterboxdRatings } from './index';

const work = (w: Partial<PivotWork> & { title: string }): PivotWork => ({ kind: 'movie', externalIds: {}, refs: [], ...w });

describe('parseLetterboxdRatings', () => {
  it('lit ratings.csv : titre, année, URI, note sur 5 et date', () => {
    const entries = parseLetterboxdRatings(fixture, '2026-11-03T00:00:00Z');
    expect(entries).toHaveLength(4);
    expect(entries[2]).toEqual({
      work: {
        kind: 'movie',
        title: 'Crouching Tiger, Hidden Dragon',
        year: 2000,
        externalIds: {},
        refs: [{ platform: 'letterboxd', id: 'https://boxd.it/synth3', url: 'https://boxd.it/synth3' }],
      },
      rating: { value: 4, scale: { min: 0.5, max: 5, step: 0.5 }, ratedAt: '2023-11-02' },
      source: { platform: 'letterboxd', fetchedAt: '2026-11-03T00:00:00Z' },
    });
    expect(entries.map((e) => e.rating?.value)).toEqual([4.5, 3, 4, 0.5]);
  });

  it('ignore une note hors échelle', () => {
    const [e] = parseLetterboxdRatings('Name,Year,Letterboxd URI,Rating\nX,2000,https://boxd.it/a,7\n', '');
    expect(e!.rating).toBeUndefined();
  });

  it('refuse un autre fichier', () => {
    expect(() => parseLetterboxdRatings('Const,Your Rating\ntt1,8\n', '')).toThrow(/ratings\.csv/);
  });
});

describe('letterboxd.parseExport', () => {
  it('ouvre directement le ZIP d’export', async () => {
    const zip = await makeZip([
      { name: 'profile.csv', content: 'Username\nxxx\n', deflate: false },
      { name: 'ratings.csv', content: fixture, deflate: true },
    ]);
    await expect(letterboxd.parseExport!({ name: 'letterboxd-export.zip', bytes: zip })).resolves.toHaveLength(4);
  });

  it('accepte aussi ratings.csv seul', async () => {
    await expect(letterboxd.parseExport!({ name: 'ratings.csv', bytes: new TextEncoder().encode(fixture) })).resolves.toHaveLength(4);
  });

  it('signale un ZIP sans ratings.csv', async () => {
    const zip = await makeZip([{ name: 'other.csv', content: 'a\n', deflate: false }]);
    await expect(letterboxd.parseExport!({ name: 'x.zip', bytes: zip })).rejects.toThrow(/ratings\.csv/);
  });
});

describe('buildLetterboxdImport', () => {
  it('produit le format documenté : titre original, année, réalisateurs, note sur 5', () => {
    const [file] = buildLetterboxdImport([
      { work: work({ title: 'Moi, moche et méchant', originalTitle: 'Despicable Me', year: 2010, directors: ['Chris Renaud', 'Pierre Coffin'] }), value: 2.5 },
      { work: work({ title: 'La Haine', year: 1995 }), value: 4.5 },
      { work: work({ title: 'Il a dit "oui"', year: 2001 }), value: 3 },
    ]);
    expect(file!.name).toBe('letterboxd-import.csv');
    expect(file!.content).toBe(
      'Title,Year,Directors,Rating\n' +
        'Despicable Me,2010,"Chris Renaud, Pierre Coffin",2.5\n' +
        'La Haine,1995,,4.5\n' +
        '"Il a dit \\"oui\\"",2001,,3\n',
    );
    // Aucune espace après une virgule de séparation.
    expect(file!.content).not.toMatch(/\d, \d/);
  });

  it('ajoute la colonne imdbID quand des identifiants sont connus (export IMDb)', () => {
    const [file] = buildLetterboxdImport([
      { work: work({ title: 'Hate', originalTitle: 'La haine', year: 1995, externalIds: { imdb: 'tt0113247' } }), value: 4 },
      { work: work({ title: 'Sans ID', year: 2000 }), value: 3 },
    ]);
    expect(parseCsv(file!.content)).toEqual([
      ['imdbID', 'Title', 'Year', 'Directors', 'Rating'],
      ['tt0113247', 'La haine', '1995', '', '4'],
      ['', 'Sans ID', '2000', '', '3'],
    ]);
  });

  it('découpe au-delà de 1 Mo en répétant l’en-tête', () => {
    const long = 'x'.repeat(1000);
    const rows = Array.from({ length: 2000 }, (_, i) => ({ work: work({ title: `${long}${i}`, year: 2000 }), value: 3 }));
    const files = buildLetterboxdImport(rows);
    expect(files.length).toBeGreaterThan(1);
    for (const f of files) {
      expect(new TextEncoder().encode(f.content).length).toBeLessThanOrEqual(MAX_IMPORT_BYTES);
      expect(f.content.startsWith('Title,Year,Directors,Rating\n')).toBe(true);
    }
    expect(files.reduce((n, f) => n + f.content.trim().split('\n').length - 1, 0)).toBe(2000);
    expect(files.map((f) => f.name)).toEqual(files.map((_, i) => `letterboxd-import-${i + 1}.csv`));
  });
});
