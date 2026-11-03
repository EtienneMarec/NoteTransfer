import { describe, expect, it } from 'vitest';
import { HttpError, PauseError } from '../errors';
import { createHttpClient, type Clock, type HostPolicy, type RawResponse, type Transport } from './client';

function fakeClock(random = 0.5) {
  let t = 0;
  const sleeps: number[] = [];
  const clock: Clock = {
    now: () => t,
    random: () => random,
    sleep: async (ms) => {
      sleeps.push(Math.round(ms));
      t += ms;
    },
  };
  return { clock, sleeps, advance: (ms: number) => (t += ms) };
}

const json = (status: number, headers: Record<string, string> = {}): RawResponse => ({
  status,
  headers: { 'content-type': 'application/json', ...headers },
  body: '{}',
});

const policy: HostPolicy = { minDelayMs: 1000, maxDelayMs: 3000, maxAttempts: 4, backoffBaseMs: 1000, backoffMaxMs: 8000 };
const signal = new AbortController().signal;

function scripted(responses: Array<RawResponse | Error>) {
  const calls: string[] = [];
  const transport: Transport = async (req) => {
    calls.push(req.url);
    const next = responses.shift();
    if (!next) throw new Error('plus de réponse prévue');
    if (next instanceof Error) throw next;
    return next;
  };
  return { transport, calls };
}

describe('createHttpClient', () => {
  it('espace les requêtes vers un même hôte d’un délai aléatoire', async () => {
    const { clock, sleeps } = fakeClock(0.5);
    const { transport } = scripted([json(200), json(200), json(200)]);
    const http = createHttpClient({ transport, clock, policyFor: () => policy });
    await http.request({ url: 'https://a.test/1' }, signal);
    await http.request({ url: 'https://a.test/2' }, signal);
    await http.request({ url: 'https://b.test/1' }, signal);
    // 1000 + 0,5 × (3000 − 1000) = 2000 ms avant la 2e requête vers a.test ; aucun délai pour b.test.
    expect(sleeps).toEqual([2000]);
  });

  it('n’envoie jamais deux requêtes en parallèle vers un même hôte', async () => {
    const { clock } = fakeClock();
    let inFlight = 0;
    let maxInFlight = 0;
    const transport: Transport = async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight--;
      return json(200);
    };
    const http = createHttpClient({ transport, clock, policyFor: () => policy });
    await Promise.all([1, 2, 3].map((i) => http.request({ url: `https://a.test/${i}` }, signal)));
    expect(maxInFlight).toBe(1);
  });

  it('réessaie sur 429 en respectant Retry-After', async () => {
    const { clock, sleeps } = fakeClock(0.5);
    const { transport, calls } = scripted([json(429, { 'Retry-After': '30' }), json(200)]);
    const http = createHttpClient({ transport, clock, policyFor: () => policy });
    const res = await http.request({ url: 'https://a.test/x' }, signal);
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(sleeps[0]).toBe(30_000);
  });

  it('applique un backoff progressif puis met en pause si les erreurs persistent', async () => {
    const { clock, sleeps } = fakeClock(0.5);
    const { transport, calls } = scripted([json(503), new TypeError('Failed to fetch'), json(502), json(503)]);
    const http = createHttpClient({ transport, clock, policyFor: () => ({ ...policy, minDelayMs: 0, maxDelayMs: 0 }) });
    const err = await http.request({ url: 'https://a.test/x' }, signal).catch((e) => e);
    expect(err).toBeInstanceOf(PauseError);
    expect(err.kind).toBe('network');
    expect(calls).toHaveLength(4);
    // jitter neutre (random = 0,5) : 1000, 2000, 4000.
    expect(sleeps).toEqual([1000, 2000, 4000]);
  });

  it('signale rate_limited quand le dernier échec est un 429', async () => {
    const { clock } = fakeClock();
    const { transport } = scripted([json(429), json(429), json(429), json(429)]);
    const http = createHttpClient({ transport, clock, policyFor: () => policy });
    await expect(http.request({ url: 'https://a.test/x' }, signal)).rejects.toMatchObject({ kind: 'rate_limited' });
  });

  it('met en pause immédiatement sur une page de challenge, sans réessayer', async () => {
    const { clock } = fakeClock();
    const challenge: RawResponse = {
      status: 403,
      headers: { 'content-type': 'text/html' },
      body: '<!DOCTYPE html><title>Just a moment...</title><script src="/cdn-cgi/challenge-platform/x.js"></script>',
    };
    const { transport, calls } = scripted([challenge]);
    const http = createHttpClient({ transport, clock, policyFor: () => policy });
    await expect(http.request({ url: 'https://a.test/x' }, signal)).rejects.toMatchObject({
      kind: 'blocked',
      detail: { reason: 'challenge' },
    });
    expect(calls).toHaveLength(1);
  });

  it('lève HttpError sans réessayer sur un 404', async () => {
    const { clock } = fakeClock();
    const { transport, calls } = scripted([json(404)]);
    const http = createHttpClient({ transport, clock, policyFor: () => policy });
    await expect(http.request({ url: 'https://a.test/x' }, signal)).rejects.toBeInstanceOf(HttpError);
    expect(calls).toHaveLength(1);
  });

  it('une requête en échec ne bloque pas la file de l’hôte', async () => {
    const { clock } = fakeClock();
    const { transport } = scripted([json(404), json(200)]);
    const http = createHttpClient({ transport, clock, policyFor: () => policy });
    await http.request({ url: 'https://a.test/1' }, signal).catch(() => undefined);
    await expect(http.request({ url: 'https://a.test/2' }, signal)).resolves.toMatchObject({ status: 200 });
  });
});
