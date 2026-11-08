import { describe, expect, it } from 'vitest';
import type { AdapterContext } from '../../core/adapter';
import type { HttpRequest, RawResponse } from '../../core/http/client';
import { silentLogger } from '../../core/log';
import page1 from './__fixtures__/movies-seen-page1.json';
import page2 from './__fixtures__/movies-seen-page2.json';
import searchMib from './__fixtures__/search-men-in-black-ii.json';
import { PauseError } from '../../core/errors';
import { render } from '../../core/i18n';
import { decideMatch } from '../../core/match/score';
import { allocine } from './index';
import { entityIdOf, manualLink, parseAcUrl, parseMoviesRated, type MoviesRatedResponse } from './parse';

function ctxReplying(responses: unknown[]) {
  const requests: Array<{ req: HttpRequest; body: { query: string; variables: Record<string, unknown> } }> = [];
  const ctx: AdapterContext = {
    http: {
      request: async (req): Promise<RawResponse> => {
        requests.push({ req, body: JSON.parse(req.body ?? '{}') });
        return { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(responses.shift()) };
      },
    },
    settings: {},
    signal: new AbortController().signal,
    log: silentLogger,
  };
  return { ctx, requests };
}

describe('parseMoviesRated (fixtures réelles anonymisées)', () => {
  it('convertit une page en entrées pivot', () => {
    const page = parseMoviesRated(page1.data as MoviesRatedResponse, '2026-11-03T00:00:00Z');
    expect(page.total).toBe(6);
    expect(page.nextCursor).toBe('YXJyYXljb25uZWN0aW9uOjI=');
    expect(page.items[2]).toEqual({
      work: {
        kind: 'movie',
        title: 'Moi, moche et méchant',
        originalTitle: 'Despicable Me',
        year: 2010,
        directors: ['Chris Renaud', 'Pierre Coffin'],
        runtimeMinutes: 95,
        externalIds: {},
        refs: [{ platform: 'allocine', id: '140623', url: 'https://www.allocine.fr/film/fichefilm_gen_cfilm=140623.html' }],
      },
      rating: { value: 2.5, scale: { min: 0.5, max: 5, step: 0.5 } },
      source: { platform: 'allocine', fetchedAt: '2026-11-03T00:00:00Z' },
    });
  });

  it('termine la pagination quand hasNextPage est faux', () => {
    const page = parseMoviesRated(page2.data as MoviesRatedResponse, '');
    expect(page.nextCursor).toBeNull();
    expect(page.items.map((i) => i.rating?.value)).toEqual([3.5, 3, 5]);
  });

  it('ne conserve aucun identifiant de nœud (qui contient l’ID utilisateur)', () => {
    const page = parseMoviesRated(page1.data as MoviesRatedResponse, '');
    expect(JSON.stringify(page)).not.toMatch(/T3Bpbmlvbj|MTAz/);
  });

  it('ignore les entités qui ne sont pas des films et garde un film sans note sans rating', () => {
    const data = structuredClone(page1.data) as MoviesRatedResponse;
    const edges = data.me!.user!.social.relatedEntities.moviesSeen.edges;
    edges[0]!.node.entity!.__typename = 'Series';
    edges[1]!.node.opinion = { content: { rating: null } };
    const page = parseMoviesRated(data, '');
    expect(page.items).toHaveLength(2);
    expect(page.items[0]!.rating).toBeUndefined();
  });

  it('signale une réponse sans session', () => {
    expect(() => parseMoviesRated({ me: null }, '')).toThrow(/session/);
  });
});

describe('allocine.readRatings', () => {
  it('envoie la requête vérifiée, puis suit le curseur', async () => {
    const { ctx, requests } = ctxReplying([page1, page2]);
    const first = await allocine.readRatings!(ctx, null);
    const second = await allocine.readRatings!(ctx, first.nextCursor);
    expect(requests.map((r) => r.req.url)).toEqual([
      'https://graph.allocine.fr/v1/public',
      'https://graph.allocine.fr/v1/public',
    ]);
    expect(requests[0]!.body.variables).toEqual({ first: 30 });
    expect(requests[1]!.body.variables).toEqual({ first: 30, after: 'YXJyYXljb25uZWN0aW9uOjI=' });
    expect(requests[0]!.body.query).toContain('action: [OPINION]');
    expect([...first.items, ...second.items]).toHaveLength(6);
  });
});

describe('allocine.checkSession', () => {
  it('reconnaît une session active', async () => {
    const { ctx } = ctxReplying([{ data: { me: { user: { nickname: 'Pseudo' } } } }]);
    await expect(allocine.checkSession(ctx)).resolves.toEqual({ state: 'ok', displayName: 'Pseudo' });
  });

  it('renvoie signed_out sans utilisateur', async () => {
    const { ctx } = ctxReplying([{ data: { me: null } }]);
    await expect(allocine.checkSession(ctx)).resolves.toMatchObject({ state: 'signed_out' });
  });
});

describe('allocine.capabilities', () => {
  it('est source et destination, avec avertissement CGU', () => {
    expect(allocine.capabilities).toMatchObject({ read: 'site', write: 'site' });
    expect(allocine.capabilities.termsWarning?.fr).toMatch(/7\.5/);
  });
});

/** Répond selon la requête, comme graph.allocine.fr et l'indicateur de maintenance. */
function ctxRouting(route: (req: HttpRequest, body: { query: string; variables: Record<string, unknown> }) => unknown) {
  const calls: Array<{ url: string; query?: string; variables?: Record<string, unknown> }> = [];
  const ctx: AdapterContext = {
    http: {
      request: async (req): Promise<RawResponse> => {
        const body = req.body ? JSON.parse(req.body) : { query: '', variables: {} };
        calls.push({ url: req.url, query: body.query, variables: body.variables });
        return { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(route(req, body)) };
      },
    },
    settings: {},
    signal: new AbortController().signal,
    log: silentLogger,
  };
  return { ctx, calls };
}

const opinion = (content: { rating: number | null; review: string | null } | null) => ({
  data: { me: { user: { social: { entities: { edges: content ? [{ node: { opinion: { content } } }] : [] } } } } },
});

describe('allocine comme destination', () => {
  it('retrouve MIIB (4e résultat réel) depuis « Men in Black II »', async () => {
    const { ctx, calls } = ctxRouting(() => searchMib);
    const query = { title: 'Men in Black II', year: 2002, directors: ['Barry Sonnenfeld'], externalIds: {} };
    const candidates = await allocine.searchFilm!(ctx, query);
    expect(calls[0]!.variables).toEqual({ text: 'Men in Black II', first: 10 });
    expect(calls).toHaveLength(1); // titre identique au titre original d'un résultat : pas de seconde recherche
    expect(decideMatch(query, candidates)).toMatchObject({ confidence: 'sure', best: { candidate: { ref: { id: '28355' } } } });
  });

  it('calcule l’identifiant d’entité attendu par l’API', () => {
    expect(entityIdOf('12551')).toBe('TW92aWU6MTI1NTE=');
  });

  it('lit la note existante, ou null sans avis', async () => {
    const ref = { platform: 'allocine' as const, id: '28355' };
    await expect(allocine.getExistingRating!(ctxRouting(() => opinion({ rating: 3, review: null })).ctx, ref)).resolves.toEqual({
      value: 3,
      scale: { min: 0.5, max: 5, step: 0.5 },
    });
    await expect(allocine.getExistingRating!(ctxRouting(() => opinion(null)).ctx, ref)).resolves.toBeNull();
  });

  it('écrit via addUserOpinion après la vérification de maintenance, et vérifie la note renvoyée', async () => {
    const { ctx, calls } = ctxRouting((req, body) => {
      if (req.url.includes('maintenance')) return { socialApiMaintenance: false };
      if (body.query.includes('addUserOpinion')) return { data: { addUserOpinion: { userEntityLeaf: { opinion: { content: { rating: 3.5 } } } } } };
      return opinion(null);
    });
    await expect(allocine.writeRating!(ctx, { platform: 'allocine', id: '12551' }, 3.5)).resolves.toEqual({ ok: true });
    expect(calls.map((c) => c.url)).toEqual([
      'https://mon.allocine.fr/_/maintenance/social',
      'https://graph.allocine.fr/v1/public',
      'https://graph.allocine.fr/v1/public',
    ]);
    expect(calls[2]!.variables).toEqual({ id: 'TW92aWU6MTI1NTE=', rating: 3.5 });
  });

  it('refuse une note invalide sans rien envoyer (AlloCiné l’arrondirait en silence)', async () => {
    const { ctx, calls } = ctxRouting(() => ({}));
    await expect(allocine.writeRating!(ctx, { platform: 'allocine', id: '1' }, 3.3)).resolves.toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
  });

  it('ne touche jamais un film qui a une critique', async () => {
    const { ctx, calls } = ctxRouting((req) => (req.url.includes('maintenance') ? { socialApiMaintenance: false } : opinion({ rating: 4, review: 'Super film' })));
    const result = await allocine.writeRating!(ctx, { platform: 'allocine', id: '1' }, 3);
    expect(render(result.ok ? undefined : result.reason, 'fr')).toMatch(/critique/);
    expect(result.ok).toBe(false);
    expect(calls.some((c) => c.query?.includes('addUserOpinion'))).toBe(false);
  });

  it('met en pause pendant une maintenance d’AlloCiné', async () => {
    const { ctx } = ctxRouting(() => ({ socialApiMaintenance: true }));
    await expect(allocine.writeRating!(ctx, { platform: 'allocine', id: '1' }, 3)).rejects.toBeInstanceOf(PauseError);
  });

  it('propose aussi le mode « à la main », avec une recherche AlloCiné ou la fiche exacte', () => {
    expect(allocine.manualWrite).toBeDefined();
    expect(manualLink({ kind: 'movie', title: 'Breathless', year: 1960, externalIds: {}, refs: [{ platform: 'letterboxd', id: 'x' }] })).toEqual({
      url: 'https://www.allocine.fr/rechercher/movie/?q=Breathless',
      exact: false,
    });
    expect(manualLink({ kind: 'movie', title: 'La Haine', externalIds: {}, refs: [{ platform: 'allocine', id: '12551' }] })).toEqual({
      url: 'https://www.allocine.fr/film/fichefilm_gen_cfilm=12551.html',
      exact: true,
    });
  });

  it('reconnaît une adresse de fiche film', () => {
    expect(parseAcUrl('https://www.allocine.fr/film/fichefilm_gen_cfilm=12551.html')).toEqual({
      platform: 'allocine',
      id: '12551',
      url: 'https://www.allocine.fr/film/fichefilm_gen_cfilm=12551.html',
    });
    expect(parseAcUrl('https://www.allocine.fr/film/fichefilm-12551/critiques/spectateurs/')).toMatchObject({ id: '12551' });
    expect(parseAcUrl('https://evil.example/film/fichefilm_gen_cfilm=1.html')).toBeNull();
  });
});
