import { describe, expect, it } from 'vitest';
import type { AdapterContext } from './adapter';
import { HttpError, PauseError } from './errors';
import { gql, isoDurationToMinutes } from './graphql';
import { raw } from './i18n';
import type { RawResponse } from './http/client';
import { silentLogger } from './log';

const ctxWith = (respond: () => RawResponse | never): AdapterContext => ({
  http: { request: async () => respond() },
  settings: {},
  signal: new AbortController().signal,
  log: silentLogger,
});
const json = (status: number, body: unknown): RawResponse => ({ status, headers: {}, body: JSON.stringify(body) });

describe('gql', () => {
  it('renvoie data', async () => {
    await expect(gql(ctxWith(() => json(200, { data: { a: 1 } })), 'https://x.test/', '{a}')).resolves.toEqual({ a: 1 });
  });

  it('met en pause « adaptateur obsolète » sur GRAPHQL_VALIDATION_FAILED, même en statut 400', async () => {
    const body = { errors: [{ message: 'Cannot query field "x"', extensions: { code: 'GRAPHQL_VALIDATION_FAILED' } }] };
    const ctx = ctxWith(() => {
      throw new HttpError(400, raw('x'), JSON.stringify(body));
    });
    await expect(gql(ctx, 'https://x.test/', '{x}')).rejects.toMatchObject({ kind: 'adapter_outdated' });
  });

  it('met en pause « déconnecté » sur UNAUTHENTICATED ou 401', async () => {
    const unauth = { errors: [{ message: 'no', extensions: { code: 'UNAUTHENTICATED' } }] };
    await expect(gql(ctxWith(() => json(200, unauth)), 'https://x.test/', '{x}')).rejects.toMatchObject({ kind: 'signed_out' });
    const ctx401 = ctxWith(() => {
      throw new HttpError(401, raw('x'), '');
    });
    await expect(gql(ctx401, 'https://x.test/', '{x}')).rejects.toBeInstanceOf(PauseError);
  });

  it('lève une erreur simple pour une erreur GraphQL métier', async () => {
    const err = (await gql(ctxWith(() => json(200, { errors: [{ message: 'Produit introuvable' }] })), 'https://x.test/', '{x}').catch(
      (e: unknown) => e,
    )) as Error;
    expect(err).not.toBeInstanceOf(PauseError);
    expect(err.message).toBe('Produit introuvable');
  });

  it('met en pause si la réponse n’est pas du JSON', async () => {
    const ctx = ctxWith(() => ({ status: 200, headers: {}, body: 'oops' }));
    await expect(gql(ctx, 'https://x.test/', '{x}')).rejects.toMatchObject({ kind: 'adapter_outdated' });
  });
});

describe('isoDurationToMinutes', () => {
  it('convertit les durées AlloCiné', () => {
    expect(isoDurationToMinutes('PT1H30M0S')).toBe(90);
    expect(isoDurationToMinutes('PT2H20M0S')).toBe(140);
    expect(isoDurationToMinutes('PT01H35M00S')).toBe(95);
    expect(isoDurationToMinutes('PT0S')).toBeUndefined();
    expect(isoDurationToMinutes('n/a')).toBeUndefined();
    expect(isoDurationToMinutes(null)).toBeUndefined();
  });
});
