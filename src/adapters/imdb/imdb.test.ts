import { describe, expect, it } from 'vitest';
// Fixture SYNTHÉTIQUE : en-têtes d'après des sources tierces, contenu inventé. À remplacer par un export réel anonymisé.
import fixture from './__fixtures__/ratings.synthetic.csv?raw';
import { imdb, parseImdbRatings } from './index';

describe('parseImdbRatings', () => {
  it('lit les films avec ID IMDb, note sur 10 et date, et ignore les séries', () => {
    const entries = parseImdbRatings(fixture, '2026-11-03T00:00:00Z');
    expect(entries.map((e) => e.work.title)).toEqual(['Hate', 'Forrest Gump', 'Despicable Me', 'The Blair Witch Project']);
    expect(entries[0]).toEqual({
      work: {
        kind: 'movie',
        title: 'Hate',
        originalTitle: 'La haine',
        year: 1995,
        directors: ['Mathieu Kassovitz'],
        runtimeMinutes: 98,
        externalIds: { imdb: 'tt0113247' },
        refs: [{ platform: 'imdb', id: 'tt0113247', url: 'https://www.imdb.com/title/tt0113247/' }],
      },
      rating: { value: 8, scale: { min: 1, max: 10, step: 1 }, ratedAt: '2024-05-12' },
      source: { platform: 'imdb', fetchedAt: '2026-11-03T00:00:00Z' },
    });
    expect(entries[2]!.work.directors).toEqual(['Pierre Coffin', 'Chris Renaud']);
  });

  it('tolère des en-têtes en minuscules et des colonnes absentes', () => {
    const entries = parseImdbRatings('const,your rating,title\ntt0000001,7,Film\n', '');
    expect(entries[0]).toMatchObject({ work: { title: 'Film', externalIds: { imdb: 'tt0000001' } }, rating: { value: 7 } });
  });

  it('refuse un fichier qui n’est pas un export de notes IMDb', () => {
    expect(() => parseImdbRatings('Name,Rating\nLa Haine,4.5\n', '')).toThrow(/Your Ratings/);
  });

  it('se lit depuis des octets via parseExport', async () => {
    const entries = await imdb.parseExport!({ name: 'ratings.csv', bytes: new TextEncoder().encode(fixture) });
    expect(entries).toHaveLength(4);
  });

  it('est une source par fichier uniquement, sans accès réseau', () => {
    expect(imdb.capabilities).toMatchObject({ read: 'file', write: null });
    expect(imdb.hostPermissions).toEqual([]);
  });
});
