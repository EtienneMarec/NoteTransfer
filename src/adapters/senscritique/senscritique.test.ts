import { describe, expect, it } from 'vitest';
import type { AdapterContext } from '../../core/adapter';
import type { HttpRequest, RawResponse } from '../../core/http/client';
import { silentLogger } from '../../core/log';
import { decideMatch } from '../../core/match/score';
import currentUserInfos from './__fixtures__/current-user-infos.json';
import product from './__fixtures__/product-472094.json';
import searchLaHaine from './__fixtures__/search-la-haine.json';
import { senscritique } from './index';
import { parseScUrl } from './parse';

type Body = { query: string; variables: Record<string, unknown> };

/** Répond selon l'opération demandée, comme le ferait apollo.senscritique.com. */
function ctxRouting(route: (body: Body) => unknown) {
  const calls: Body[] = [];
  const ctx: AdapterContext = {
    http: {
      request: async (req: HttpRequest): Promise<RawResponse> => {
        const body = JSON.parse(req.body ?? '{}') as Body;
        calls.push(body);
        return { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(route(body)) };
      },
    },
    settings: {},
    signal: new AbortController().signal,
    log: silentLogger,
  };
  return { ctx, calls };
}

const laHaineQuery = { title: 'La Haine', year: 1995, directors: ['Mathieu Kassovitz'], runtimeMinutes: 95, externalIds: {} };

describe('senscritique.searchFilm (fixtures réelles)', () => {
  it('cherche, ne détaille que les candidats plausibles, et permet une correspondance « sûre »', async () => {
    const { ctx, calls } = ctxRouting((b) => {
      if (b.query.includes('searchAutocomplete')) return searchLaHaine;
      if (b.query.includes('NotesTransfertProducts')) return { data: { p0: product.data.product } };
      throw new Error('requête inattendue');
    });
    const candidates = await senscritique.searchFilm!(ctx, laHaineQuery);

    expect(calls[0]!.variables).toEqual({ keywords: 'La Haine', universe: 'movie', limit: 8 });
    // Seul « La Haine » (1995) passe le filtre titre + année : les autres sont de 1956, 2001, 2018, 2020.
    expect(calls[1]!.variables).toEqual({ id0: 472094 });
    expect(candidates).toEqual([
      {
        ref: { platform: 'senscritique', id: '472094', url: 'https://www.senscritique.com/film/-/472094' },
        work: {
          kind: 'movie',
          title: 'La Haine',
          originalTitle: 'La Haine',
          year: 1995,
          directors: ['Mathieu Kassovitz'],
          runtimeMinutes: 98,
          externalIds: {},
          refs: [{ platform: 'senscritique', id: '472094', url: 'https://www.senscritique.com/film/-/472094' }],
        },
      },
    ]);
    expect(decideMatch(laHaineQuery, candidates)).toMatchObject({ confidence: 'sure' });
  });

  it('relance une recherche sur le titre original si le titre français ne donne rien de proche', async () => {
    const { ctx, calls } = ctxRouting((b) =>
      b.query.includes('searchAutocomplete') ? { data: { searchAutocomplete: { items: [] } } } : { data: {} },
    );
    await senscritique.searchFilm!(ctx, { title: 'MIIB', originalTitle: 'Men in Black II', year: 2002, externalIds: {} });
    expect(calls.map((c) => c.variables.keywords)).toEqual(['MIIB', 'Men in Black II']);
  });
});

describe('senscritique.getExistingRating (fixtures réelles)', () => {
  it('lit la note de la session', async () => {
    const { ctx } = ctxRouting(() => currentUserInfos.authenticated);
    await expect(senscritique.getExistingRating!(ctx, { platform: 'senscritique', id: '472094' })).resolves.toEqual({
      value: 8,
      scale: { min: 1, max: 10, step: 1 },
    });
  });

  it('renvoie null quand il n’y a pas de note', async () => {
    const { ctx } = ctxRouting(() => currentUserInfos.anonymous);
    await expect(senscritique.getExistingRating!(ctx, { platform: 'senscritique', id: '472094' })).resolves.toBeNull();
  });
});

describe('senscritique.writeRating', () => {
  // Réponse construite d'après la sélection de la mutation : jamais exécutée sur le vrai site à ce stade.
  it('envoie ProductRate et vérifie la note renvoyée', async () => {
    const { ctx, calls } = ctxRouting(() => ({ data: { productRate: { id: 472094, currentUserInfos: { rating: 7 } } } }));
    await expect(senscritique.writeRating!(ctx, { platform: 'senscritique', id: '472094' }, 7)).resolves.toEqual({ ok: true });
    expect(calls[0]!.query).toContain('productRate(productId: $productId, rating: $rating)');
    expect(calls[0]!.variables).toEqual({ productId: 472094, rating: 7 });
  });

  it('refuse une note hors échelle sans rien envoyer', async () => {
    const { ctx, calls } = ctxRouting(() => ({}));
    await expect(senscritique.writeRating!(ctx, { platform: 'senscritique', id: '1' }, 7.5)).resolves.toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
  });
});

describe('parseScUrl', () => {
  it('reconnaît une fiche film', () => {
    expect(parseScUrl('https://www.senscritique.com/film/la_haine/472094')).toMatchObject({ id: '472094' });
    expect(parseScUrl('https://www.senscritique.com/film/la_haine/472094/critiques')).toMatchObject({ id: '472094' });
    expect(parseScUrl('https://www.senscritique.com/serie/x/1')).toBeNull();
    expect(parseScUrl('https://evil.example/film/x/1')).toBeNull();
    expect(parseScUrl('pas une url')).toBeNull();
  });
});
