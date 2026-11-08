import { describe, expect, it } from 'vitest';
import type { AdapterContext } from '../../core/adapter';
import { PauseError } from '../../core/errors';
import type { RawResponse } from '../../core/http/client';
import { silentLogger } from '../../core/log';
import { decideMatch } from '../../core/match/score';
import searchMib from './__fixtures__/search-men-in-black-ii.json';
import { imdb } from './index';
import { manualLink, parseImdbUrl } from './parse';

type Body = { query: string; variables: Record<string, unknown> };

function ctxRouting(route: (b: Body) => unknown) {
  const calls: Body[] = [];
  const ctx: AdapterContext = {
    http: {
      request: async (req): Promise<RawResponse> => {
        const b = JSON.parse(req.body ?? '{}') as Body;
        calls.push(b);
        return { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(route(b)) };
      },
    },
    settings: {},
    signal: new AbortController().signal,
    log: silentLogger,
  };
  return { ctx, calls };
}

// Réponses réelles observées le 2026-11-04 (compte de test).
const ratingOf = (value: number | null) => ({ data: { title: { userRating: value === null ? null : { value } } } });
const forbidden = {
  errors: [
    {
      message: 'FORBIDDEN exception code while fetching data (/_entities[0]/userRating) : Authentication required but not provided',
      extensions: { code: 'FORBIDDEN' },
    },
  ],
  data: { title: { userRating: null } },
};

describe('imdb comme destination (API interne)', () => {
  it('trouve « Men in Black II » par recherche (réponse réelle) et le classe « sûr »', async () => {
    const { ctx, calls } = ctxRouting(() => searchMib);
    const q = { title: 'MIIB', originalTitle: 'Men in Black II', year: 2002, directors: ['Barry Sonnenfeld'], externalIds: {} };
    const candidates = await imdb.searchFilm!(ctx, q);
    expect(calls[0]!.variables).toEqual({ text: 'Men in Black II', first: 8 }); // titre original d'abord
    expect(calls).toHaveLength(1);
    expect(decideMatch(q, candidates)).toMatchObject({ confidence: 'sure', best: { candidate: { ref: { id: 'tt0120912' } } } });
  });

  it('utilise directement l’ID IMDb quand la source le fournit', async () => {
    const { ctx, calls } = ctxRouting(() => ({ data: { title: searchMib.data.mainSearch.edges[0]!.node.entity } }));
    const candidates = await imdb.searchFilm!(ctx, { title: 'Men in Black II', externalIds: { imdb: 'tt0120912' } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.query).toContain('title(id: $id)');
    expect(candidates[0]?.work.externalIds.imdb).toBe('tt0120912');
  });

  it('lit la note existante', async () => {
    await expect(imdb.getExistingRating!(ctxRouting(() => ratingOf(9)).ctx, { platform: 'imdb', id: 'tt0120586' })).resolves.toEqual({
      value: 9,
      scale: { min: 1, max: 10, step: 1 },
    });
    await expect(imdb.getExistingRating!(ctxRouting(() => ratingOf(null)).ctx, { platform: 'imdb', id: 'tt0185937' })).resolves.toBeNull();
  });

  it('détecte une session absente (FORBIDDEN « Authentication required »)', async () => {
    await expect(imdb.checkSession(ctxRouting(() => forbidden).ctx)).resolves.toMatchObject({ state: 'signed_out' });
    await expect(imdb.getExistingRating!(ctxRouting(() => forbidden).ctx, { platform: 'imdb', id: 'tt1' })).rejects.toBeInstanceOf(PauseError);
    await expect(imdb.checkSession(ctxRouting(() => ratingOf(null)).ctx)).resolves.toEqual({ state: 'ok' });
  });

  it('écrit avec rateTitle et vérifie la note renvoyée', async () => {
    const { ctx, calls } = ctxRouting(() => ({ data: { rateTitle: { rating: { value: 7 } } } }));
    await expect(imdb.writeRating!(ctx, { platform: 'imdb', id: 'tt0053472' }, 7)).resolves.toEqual({ ok: true });
    expect(calls[0]!.query).toContain('rateTitle(input: { rating: $rating, titleId: $titleId })');
    expect(calls[0]!.variables).toEqual({ rating: 7, titleId: 'tt0053472' });
  });

  it('n’envoie jamais 0 (qui supprimerait la note) ni une valeur hors échelle', async () => {
    const { ctx, calls } = ctxRouting(() => ({}));
    for (const v of [0, 11, 7.5]) await expect(imdb.writeRating!(ctx, { platform: 'imdb', id: 'tt1' }, v)).resolves.toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
  });

  it('affiche l’avertissement CGU et propose le mode à la main', () => {
    expect(imdb.capabilities).toMatchObject({ read: 'file', write: 'site' });
    expect(imdb.capabilities.termsWarning?.fr).toMatch(/Amazon/);
    expect(imdb.manualWrite).toBeDefined();
  });
});

describe('imdb : liens du mode « à la main » et URL collées', () => {
  it('lie la fiche exacte si l’ID est connu, sinon une recherche de films', () => {
    expect(manualLink({ kind: 'movie', title: 'Hate', externalIds: { imdb: 'tt0113247' }, refs: [] })).toEqual({
      url: 'https://www.imdb.com/title/tt0113247/',
      exact: true,
    });
    expect(manualLink({ kind: 'movie', title: 'MIIB', originalTitle: 'Men in Black II', year: 2002, externalIds: {}, refs: [] })).toEqual({
      url: 'https://www.imdb.com/find/?q=Men%20in%20Black%20II%202002&s=tt&ttype=ft',
      exact: false,
    });
  });

  it('reconnaît une adresse de fiche', () => {
    expect(parseImdbUrl('https://www.imdb.com/fr/title/tt0113247/?ref_=hm')).toMatchObject({ id: 'tt0113247' });
    expect(parseImdbUrl('https://m.imdb.com/title/tt0113247/')).toMatchObject({ id: 'tt0113247' });
    expect(parseImdbUrl('https://example.com/title/tt1/')).toBeNull();
  });
});
