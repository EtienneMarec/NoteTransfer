import { describe, expect, it } from 'vitest';
import { createLogger, redact, REDACTED, type LogRecord } from './log';

describe('redact', () => {
  it('masque les en-têtes et champs sensibles, quelle que soit la casse', () => {
    expect(
      redact({
        Authorization: 'Bearer abc',
        cookie: 'sid=1',
        'Set-Cookie': 'x',
        accessToken: 'y',
        client_secret: 'z',
        api_key: 'k',
        title: 'La Haine',
      }),
    ).toEqual({
      Authorization: REDACTED,
      cookie: REDACTED,
      'Set-Cookie': REDACTED,
      accessToken: REDACTED,
      client_secret: REDACTED,
      api_key: REDACTED,
      title: 'La Haine',
    });
  });

  it('masque les objets Headers', () => {
    const h = new Headers({ authorization: 'Bearer abc', 'content-type': 'application/json' });
    expect(redact(h)).toEqual({ authorization: REDACTED, 'content-type': 'application/json' });
  });

  it('masque un jeton Bearer ou un JWT glissé dans une chaîne', () => {
    expect(redact('échec avec Bearer abc.def')).toBe(`échec avec ${REDACTED}`);
    expect(redact('jwt=eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl')).toBe(`jwt=${REDACTED}`);
  });

  it('parcourt les structures imbriquées', () => {
    expect(redact({ req: { headers: [{ Cookie: 'a' }] } })).toEqual({ req: { headers: [{ Cookie: REDACTED }] } });
  });
});

describe('createLogger', () => {
  it('ne transmet jamais de donnée sensible au sink', () => {
    const records: LogRecord[] = [];
    const log = createLogger((r) => records.push(r), () => new Date('2026-01-01T00:00:00Z'));
    log.warn('réponse 429 (Bearer secret123)', { headers: { authorization: 'Bearer secret123' } });
    expect(JSON.stringify(records)).not.toContain('secret123');
    expect(records[0]).toMatchObject({ level: 'warn', at: '2026-01-01T00:00:00.000Z' });
  });
});
