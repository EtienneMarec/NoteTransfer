import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFromPage } from './site-bridge';

const g = globalThis as unknown as { document?: { cookie: string }; fetch: typeof fetch };
const originalFetch = g.fetch;

afterEach(() => {
  delete g.document;
  g.fetch = originalFetch;
});

describe('fetchFromPage (exécutée dans la page du site)', () => {
  it('ajoute l’en-tête d’authentification lu dans le cookie, sans le renvoyer', async () => {
    g.document = { cookie: 'autre=1; GraphToken=abc%2Edef; x=y' };
    const fetchMock = vi.fn(async () => new Response('{"data":{}}', { status: 200, headers: { 'content-type': 'application/json' } }));
    g.fetch = fetchMock as unknown as typeof fetch;

    const res = await fetchFromPage(
      { url: 'https://graph.allocine.fr/v1/public', method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
      { cookie: 'GraphToken', header: 'Authorization', prefix: 'Bearer ' },
    );
    expect(fetchMock).toHaveBeenCalledWith('https://graph.allocine.fr/v1/public', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer abc.def' },
      body: '{}',
      credentials: 'same-origin',
    });
    expect(res).toEqual({ status: 200, headers: { 'content-type': 'application/json' }, body: '{"data":{}}' });
    expect(JSON.stringify(res)).not.toContain('abc');
  });

  it('n’ajoute rien sans cookie de session', async () => {
    g.document = { cookie: 'autre=1' };
    const fetchMock = vi.fn(async () => new Response('', { status: 401 }));
    g.fetch = fetchMock as unknown as typeof fetch;
    await fetchFromPage({ url: 'https://apollo.senscritique.com/', method: 'POST', headers: {}, body: '{}' }, { cookie: 'SC_AUTH', header: 'authorization', prefix: '' });
    expect(fetchMock).toHaveBeenCalledWith('https://apollo.senscritique.com/', { method: 'POST', headers: {}, body: '{}', credentials: 'same-origin' });
  });

  it('sans auth, s’appuie sur les cookies du site (IMDb : credentials include)', async () => {
    g.document = { cookie: 'session-id=1' };
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    g.fetch = fetchMock as unknown as typeof fetch;
    await fetchFromPage({ url: 'https://api.graphql.imdb.com/', method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }, null, 'include');
    expect(fetchMock).toHaveBeenCalledWith('https://api.graphql.imdb.com/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      credentials: 'include',
    });
  });

  it('renvoie l’erreur réseau sous forme de valeur', async () => {
    g.document = { cookie: '' };
    g.fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(fetchFromPage({ url: 'https://x.test/', method: 'GET', headers: {}, body: null }, { cookie: 'a', header: 'b', prefix: '' })).resolves.toEqual({
      error: 'Failed to fetch',
    });
  });
});
