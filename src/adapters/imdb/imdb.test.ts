import { describe, expect, it } from 'vitest';
// Export RÉEL d'un compte de test (interface en français), 2026-11-03 : aucune donnée personnelle.
import real from './__fixtures__/ratings.real-fr.csv?raw';
// Fixture SYNTHÉTIQUE, en anglais, pour les cas absents de l'export réel (série, plusieurs réalisateurs).
import fixture from './__fixtures__/ratings.synthetic.csv?raw';
import { imdb, parseImdbRatings } from './index';

describe('parseImdbRatings (export réel)', () => {
  it('lit les 3 films d’un export en français, où le type vaut « Film »', () => {
    const entries = parseImdbRatings(real, '2026-11-03T00:00:00Z');
    expect(entries.map((e) => [e.work.title, e.rating?.value, e.work.externalIds.imdb])).toEqual([
      ['À bout de souffle', 7, 'tt0053472'],
      ['Forrest Gump', 6, 'tt0109830'],
      ['La Haine', 8, 'tt0113247'],
    ]);
    expect(entries[2]).toEqual({
      work: {
        kind: 'movie',
        title: 'La Haine',
        originalTitle: 'La haine',
        year: 1995,
        directors: ['Mathieu Kassovitz'],
        runtimeMinutes: 98,
        externalIds: { imdb: 'tt0113247' },
        refs: [{ platform: 'imdb', id: 'tt0113247', url: 'https://www.imdb.com/title/tt0113247/' }],
      },
      rating: { value: 8, scale: { min: 1, max: 10, step: 1 }, ratedAt: '2026-11-03' },
      source: { platform: 'imdb', fetchedAt: '2026-11-03T00:00:00Z' },
    });
  });

  it('ignore les séries et épisodes, quelle que soit la langue', () => {
    const csv = 'Const,Your Rating,Title,Title Type\ntt1,7,A,Série TV\ntt2,7,B,Épisode TV\ntt3,7,C,TV Series\ntt4,7,D,Téléfilm\ntt5,7,E,Court métrage\n';
    expect(parseImdbRatings(csv, '').map((e) => e.work.title)).toEqual(['D', 'E']);
  });
});

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
