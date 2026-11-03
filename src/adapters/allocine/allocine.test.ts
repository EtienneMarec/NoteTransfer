import { describe, expect, it } from 'vitest';
import type { AdapterContext } from '../../core/adapter';
import type { HttpRequest, RawResponse } from '../../core/http/client';
import { silentLogger } from '../../core/log';
import page1 from './__fixtures__/movies-seen-page1.json';
import page2 from './__fixtures__/movies-seen-page2.json';
import { allocine } from './index';
import { parseMoviesRated, type MoviesRatedResponse } from './parse';

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
  it('est une source uniquement en V1, avec avertissement CGU', () => {
    expect(allocine.capabilities.read).toBe('site');
    expect(allocine.capabilities.write).toBeNull();
    expect(allocine.capabilities.termsWarning).toMatch(/7\.5/);
  });
});
